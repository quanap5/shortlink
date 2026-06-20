# Cognito Hosted UI Auth

ShortLink uses Cognito Hosted UI for MVP authentication. The user-facing login copy should stay provider-neutral; do not mention Cognito in visible frontend text.

## Security Model

- Cognito Hosted UI handles user credentials.
- The frontend uses Authorization Code + PKCE.
- The frontend app client has no client secret.
- API Gateway verifies JWTs for protected routes.
- Public routes:
  - `GET /health`
  - `GET /{slug}`
- Protected routes:
  - `GET /links`
  - `POST /links`

## Runtime Config

CDK deploys `auth-config.json` to the frontend S3 bucket. The static frontend fetches this file at runtime.

It includes:

- API base URL
- Cognito domain
- User pool ID
- User pool client ID
- Redirect URI
- Logout URI

The default hosted domain is the AWS-managed Cognito domain. Production can switch to the branded custom auth domain:

```text
https://auth.twinqx.com
```

To enable it, validate the `auth.twinqx.com` ACM certificate in `us-east-1`, set `authDomainName` and `authCertificateArn` in `infra/cdk.json`, deploy CDK, then add the Cognito custom domain alias target as a Cloudflare `CNAME` record with proxy disabled.

For the custom frontend domain, Cognito callback and logout URLs are:

```text
https://link.twinqx.com/auth/callback
https://link.twinqx.com
```

The CloudFront URL is no longer the primary browser URL after the custom domain deploy succeeds.

## Create A Test User

1. Open AWS Console.
2. Select `ap-northeast-2`.
3. Go to Cognito.
4. Open the ShortLink user pool.
5. Create a user with an email address.
6. Set a temporary password.
7. Open the frontend `/login` page and sign in through Cognito Hosted UI.

## Tenant Claim

Backend tenant resolution checks `custom:tenant_id` from Cognito JWT claims.

Public redirect and local development paths may still use:

```text
default-tenant
```

Protected API requests require the claim. If an authenticated protected request is missing `custom:tenant_id`, the API returns `403`.

## Public Tenant Registration

New tenants register at `/register`.

The browser calls `POST /tenants/register`; it does not write Cognito custom tenant attributes directly. Backend registration creates the tenant record, then signs up the owner through a server-only Cognito app client with `custom:tenant_id` and `custom:role=owner`.

After registration, Cognito sends the verification email. The user verifies email and signs in through the existing Hosted UI login page.

Protected APIs require `custom:tenant_id` in the JWT. Authenticated requests without this claim return `403`.
