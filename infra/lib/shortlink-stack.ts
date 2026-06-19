import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
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

    const clickEventsTable = new dynamodb.Table(this, "ClickEventsTable", {
      partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "slug_occurred_at", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const clickEventsQueue = new sqs.Queue(this, "ClickEventsQueue", {
      visibilityTimeout: Duration.seconds(30),
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const backendFunction = new lambda.Function(this, "BackendFunction", {
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "app.main.handler",
      code: lambda.Code.fromAsset("../backend", {
        exclude: [
          ".venv",
          ".pytest_cache",
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
      }),
      timeout: Duration.seconds(10),
      memorySize: 512,
      environment: {
        SHORTLINK_LINKS_TABLE_NAME: linksTable.tableName,
        SHORTLINK_CLICK_EVENTS_TABLE_NAME: clickEventsTable.tableName,
        SHORTLINK_CLICK_EVENTS_QUEUE_URL: clickEventsQueue.queueUrl,
        SHORTLINK_USER_POOL_ID: userPool.userPoolId,
      },
    });

    linksTable.grantReadWriteData(backendFunction);
    clickEventsTable.grantReadWriteData(backendFunction);
    clickEventsQueue.grantSendMessages(backendFunction);

    const api = new apigatewayv2.HttpApi(this, "HttpApi", {
      apiName: "shortlink-api",
      defaultIntegration: new integrations.HttpLambdaIntegration(
        "BackendIntegration",
        backendFunction,
      ),
    });

    const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        "api/*": {
          origin: new origins.HttpOrigin(`${api.apiId}.execute-api.${this.region}.amazonaws.com`),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: "index.html",
    });

    new s3deploy.BucketDeployment(this, "FrontendDeployment", {
      sources: [s3deploy.Source.asset("../frontend/out")],
      destinationBucket: frontendBucket,
      distribution,
    });

    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "HttpApiEndpoint", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
  }
}
