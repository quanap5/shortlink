# Cognito Hosted UI Auth

ShortLink uses Cognito Hosted UI for MVP authentication.

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

If the claim is absent, it falls back to:

```text
default-tenant
```

This preserves the current single-tenant MVP redirect behavior. A later multi-tenant phase should add a required tenant claim and update redirect routing accordingly.
