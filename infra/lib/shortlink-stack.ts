import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as eventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export class ShortLinkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const linksTable = new dynamodb.Table(this, "LinksTable", {
      partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "slug", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    linksTable.addGlobalSecondaryIndex({
      indexName: "slug_index",
      partitionKey: { name: "slug", type: dynamodb.AttributeType.STRING },
    });

    const clickEventsTable = new dynamodb.Table(this, "ClickEventsTable", {
      partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "slug_occurred_at", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const analyticsAggregatesTable = new dynamodb.Table(this, "AnalyticsAggregatesTable", {
      partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "metric_key", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const tenantsTable = new dynamodb.Table(this, "TenantsTable", {
      partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const clickEventsQueue = new sqs.Queue(this, "ClickEventsQueue", {
      visibilityTimeout: Duration.seconds(30),
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      customAttributes: {
        tenant_id: new cognito.StringAttribute({ mutable: false, minLen: 3, maxLen: 64 }),
        role: new cognito.StringAttribute({ mutable: false, minLen: 3, maxLen: 32 }),
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: false,
        requireUppercase: true,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const frontendUrl =
      this.node.tryGetContext("frontendUrl") ?? "https://djg0fa4zryeod.cloudfront.net";
    const frontendDomainName = this.node.tryGetContext("frontendDomainName") as string | undefined;
    const frontendCertificateArn = this.node.tryGetContext("frontendCertificateArn") as
      | string
      | undefined;
    const authDomainName = this.node.tryGetContext("authDomainName") as string | undefined;
    const authCertificateArn = this.node.tryGetContext("authCertificateArn") as string | undefined;
    const frontendCertificate =
      frontendCertificateArn && frontendDomainName
        ? acm.Certificate.fromCertificateArn(
            this,
            "FrontendCertificate",
            frontendCertificateArn,
          )
        : undefined;
    const useCustomAuthDomain = Boolean(authDomainName && authCertificateArn);
    const callbackUrl = `${frontendUrl}/auth/callback`;
    const logoutUrl = frontendUrl;

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true }),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true })
        .withCustomAttributes("tenant_id", "role"),
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [callbackUrl, "http://localhost:3000/auth/callback"],
        logoutUrls: [logoutUrl, "http://localhost:3000"],
      },
      preventUserExistenceErrors: true,
    });

    const registrationUserPoolClient = new cognito.UserPoolClient(
      this,
      "RegistrationUserPoolClient",
      {
        userPool,
        generateSecret: true,
        authFlows: {
          userSrp: true,
        },
        oAuth: {
          flows: {},
          scopes: [],
          callbackUrls: [],
          logoutUrls: [],
        },
        preventUserExistenceErrors: true,
        writeAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({ email: true })
          .withCustomAttributes("tenant_id", "role"),
        readAttributes: new cognito.ClientAttributes()
          .withStandardAttributes({ email: true, emailVerified: true })
          .withCustomAttributes("tenant_id", "role"),
      },
    );
    const registrationUserPoolClientResource =
      registrationUserPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    registrationUserPoolClientResource.addPropertyDeletionOverride(
      "AllowedOAuthFlowsUserPoolClient",
    );
    registrationUserPoolClientResource.addPropertyDeletionOverride("AllowedOAuthScopes");
    registrationUserPoolClientResource.addPropertyDeletionOverride("LogoutURLs");

    const userPoolDomain =
      useCustomAuthDomain
        ? new cognito.UserPoolDomain(this, "UserPoolDomain", {
            userPool,
            customDomain: {
              certificate: acm.Certificate.fromCertificateArn(
                this,
                "AuthDomainCertificate",
                authCertificateArn!,
              ),
              domainName: authDomainName!,
            },
          })
        : new cognito.UserPoolDomain(this, "UserPoolDomain", {
            userPool,
            cognitoDomain: {
              domainPrefix: `shortlink-${this.account}-${this.region}`,
            },
          });
    const cognitoBaseUrl = useCustomAuthDomain && authDomainName
      ? `https://${authDomainName}`
      : `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;

    const backendCode = lambda.Code.fromAsset("../backend", {
        exclude: [
          ".venv",
          ".pytest_cache",
          ".pytest_cache_codex",
          ".ruff_cache",
          "__pycache__",
          "**/__pycache__",
          "tests",
        ],
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            "bash",
            "-c",
            [
              "python -m pip install --no-cache-dir -r requirements.txt -t /asset-output",
              "cp -R app /asset-output/app",
            ].join(" && "),
          ],
        },
      });

    const backendEnvironment = {
      SHORTLINK_LINKS_TABLE_NAME: linksTable.tableName,
      SHORTLINK_TENANTS_TABLE_NAME: tenantsTable.tableName,
      SHORTLINK_CLICK_EVENTS_TABLE_NAME: clickEventsTable.tableName,
      SHORTLINK_ANALYTICS_AGGREGATES_TABLE_NAME: analyticsAggregatesTable.tableName,
      SHORTLINK_CLICK_EVENTS_QUEUE_URL: clickEventsQueue.queueUrl,
      SHORTLINK_USER_POOL_ID: userPool.userPoolId,
      SHORTLINK_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
    };
    const registrationEnvironment = {
      SHORTLINK_COGNITO_REGISTRATION_CLIENT_ID:
        registrationUserPoolClient.userPoolClientId,
      SHORTLINK_COGNITO_REGISTRATION_CLIENT_SECRET:
        registrationUserPoolClient.userPoolClientSecret.unsafeUnwrap(),
    };

    const backendFunction = new lambda.Function(this, "BackendFunction", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "app.main.handler",
      code: backendCode,
      timeout: Duration.seconds(10),
      memorySize: 512,
      environment: {
        ...backendEnvironment,
        ...registrationEnvironment,
      },
    });

    const clickEventConsumerFunction = new lambda.Function(this, "ClickEventConsumerFunction", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "app.handlers.click_events.handler",
      code: backendCode,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: backendEnvironment,
    });

    linksTable.grantReadWriteData(backendFunction);
    tenantsTable.grantReadWriteData(backendFunction);
    clickEventsTable.grantReadWriteData(backendFunction);
    analyticsAggregatesTable.grantReadWriteData(backendFunction);
    clickEventsQueue.grantSendMessages(backendFunction);
    clickEventsTable.grantReadWriteData(clickEventConsumerFunction);
    analyticsAggregatesTable.grantReadWriteData(clickEventConsumerFunction);
    clickEventsQueue.grantConsumeMessages(clickEventConsumerFunction);
    backendFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:ConfirmSignUp", "cognito-idp:SignUp"],
        resources: [userPool.userPoolArn],
      }),
    );
    clickEventConsumerFunction.addEventSource(
      new eventSources.SqsEventSource(clickEventsQueue, {
        batchSize: 10,
      }),
    );

    const backendIntegration = new integrations.HttpLambdaIntegration(
      "BackendIntegration",
      backendFunction,
    );
    const api = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "shortlink-api",
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [frontendUrl, "http://localhost:3000"],
      },
    });
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      "CognitoJwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
      },
    );

    api.addRoutes({
      path: "/health",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: backendIntegration,
    });
    api.addRoutes({
      path: "/tenants/register",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: backendIntegration,
    });
    api.addRoutes({
      path: "/tenants/verify-email",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: backendIntegration,
    });
    api.addRoutes({
      path: "/links",
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: backendIntegration,
      authorizer: jwtAuthorizer,
    });
    api.addRoutes({
      path: "/analytics/links",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: backendIntegration,
      authorizer: jwtAuthorizer,
    });
    for (const path of [
      "/analytics/summary",
      "/analytics/timeseries",
      "/analytics/breakdowns/{dimension}",
      "/analytics/top-links",
      "/analytics/map",
    ]) {
      api.addRoutes({
        path,
        methods: [apigatewayv2.HttpMethod.GET],
        integration: backendIntegration,
        authorizer: jwtAuthorizer,
      });
    }
    api.addRoutes({
      path: "/links/{slug}/analytics",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: backendIntegration,
      authorizer: jwtAuthorizer,
    });
    api.addRoutes({
      path: "/{slug}",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: backendIntegration,
    });

    const frontendRewriteFunction = new cloudfront.Function(this, "FrontendRewriteFunction", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    request.uri = uri + '.html';
  }
  return request;
}
`),
    });

    const frontendOrigin = origins.S3BucketOrigin.withOriginAccessControl(frontendBucket);
    const apiOrigin = new origins.HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`);
    const frontendBehavior = {
      origin: frontendOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [
        {
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: frontendRewriteFunction,
        },
      ],
    };
    const apiBehavior = {
      origin: apiOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    };

    const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      ...(frontendCertificate && frontendDomainName
        ? {
            certificate: frontendCertificate,
            domainNames: [frontendDomainName],
          }
        : {}),
      defaultBehavior: apiBehavior,
      additionalBehaviors: {
        "/": frontendBehavior,
        "_next/*": frontendBehavior,
        "analytics": frontendBehavior,
        "auth/*": frontendBehavior,
        "auth-config.json": frontendBehavior,
        "dashboard/*": frontendBehavior,
        "favicon.ico": frontendBehavior,
        "index.html": frontendBehavior,
        "links": frontendBehavior,
        "links/*": frontendBehavior,
        "login": frontendBehavior,
        "logout": frontendBehavior,
        "register": frontendBehavior,
        "verify-email": frontendBehavior,
        "twinqx-logo.jpg": frontendBehavior,
      },
      defaultRootObject: "index.html",
    });

    new s3deploy.BucketDeployment(this, "FrontendDeployment", {
      sources: [
        s3deploy.Source.asset("../frontend/out"),
        s3deploy.Source.jsonData("auth-config.json", {
          apiBaseUrl: api.apiEndpoint,
          clientId: userPoolClient.userPoolClientId,
          cognitoDomain: cognitoBaseUrl,
          logoutUri: logoutUrl,
          redirectBaseUrl: frontendUrl,
          redirectUri: callbackUrl,
          region: this.region,
          userPoolId: userPool.userPoolId,
        }),
      ],
      destinationBucket: frontendBucket,
      distribution,
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: distribution.distributionDomainName,
    });
    if (frontendDomainName) {
      new cdk.CfnOutput(this, "FrontendCustomDomainName", {
        value: frontendDomainName,
      });
    }
    new cdk.CfnOutput(this, "HttpApiEndpoint", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoDomain", {
      value: cognitoBaseUrl,
    });
    new cdk.CfnOutput(this, "AuthCustomDomainName", {
      value: useCustomAuthDomain && authDomainName ? authDomainName : userPoolDomain.domainName,
    });
    new cdk.CfnOutput(this, "CognitoLoginUrl", {
      value: `${cognitoBaseUrl}/login?client_id=${userPoolClient.userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=${callbackUrl}`,
    });
  }
}
