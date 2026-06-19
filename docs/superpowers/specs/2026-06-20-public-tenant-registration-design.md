# Public Tenant Registration Design

## Goal

Allow a new customer to create a ShortLink tenant from the public frontend, then sign in with Cognito and use an isolated workspace.

This is an MVP registration flow. It does not add billing, enterprise SSO, custom domains, organization settings, or a full member-management console.

## Chosen Approach

Use a backend-controlled public registration endpoint.

The frontend must not call Cognito sign-up directly with a client-chosen `custom:tenant_id`. Tenant identity is security-sensitive, so the backend owns tenant creation, tenant ID generation, uniqueness checks, and Cognito custom attributes.

Use two Cognito app clients:

- Hosted UI public client: used by the browser for login, with no client secret and no permission to write `custom:tenant_id` or `custom:role`.
- Registration server client: used only by the backend, with a client secret. Backend computes `SECRET_HASH` and calls Cognito sign-up with server-controlled custom attributes.

## User Flow

1. User opens `/register`.
2. User enters tenant name, email, and password.
3. Frontend calls `POST /tenants/register`.
4. Backend validates tenant name, email, and password shape.
5. Backend creates a tenant record with a normalized unique `tenant_id`.
6. Backend creates a Cognito user through the server-only registration client with server-controlled attributes:
   - `custom:tenant_id`
   - `custom:role=owner`
7. Cognito sends the normal verification email.
8. User verifies email.
9. User signs in through Cognito Hosted UI.
10. Protected APIs use the JWT `custom:tenant_id` claim for tenant isolation.

## Architecture

### Frontend

- Add `/register`.
- Add a simple form for tenant name, email, and password.
- Show clear states:
  - creating account
  - registration created
  - check email for verification
  - conflict or validation error
- Keep `/login` as the sign-in entry point using Cognito Hosted UI.

### Backend

- Add a public `POST /tenants/register` route.
- Keep business logic outside the route handler.
- Add a registration service responsible for:
  - tenant slug normalization
  - uniqueness check
  - Cognito user creation through a server-only Cognito adapter
  - rollback or fail-safe handling if tenant creation succeeds but Cognito creation fails
- Add repository abstraction for tenants.
- Add DynamoDB tenant repository implementation.

### Infrastructure

- Add `TenantsTable`.
- Add Cognito custom attributes:
  - `tenant_id`
  - `role`
- Add a second Cognito app client for registration:
  - generate client secret
  - allow sign-up through backend only
  - allow writing `custom:tenant_id` and `custom:role`
- Restrict the Hosted UI client so browser flows cannot write tenant or role custom attributes.
- Grant backend Lambda only the minimum Cognito permissions needed for registration.
- Keep DNS and CloudFront behavior unchanged.
- Keep Cognito Hosted UI for sign-in.

## Data Model

Tenant record:

- `tenant_id`: normalized unique slug, such as `acme-inc`
- `name`: display name
- `owner_email`: first owner email
- `status`: `pending_verification` or `active`
- `created_at`: timestamp

User role claim:

- `custom:role=owner` for the first user of a tenant.

## Security Requirements

- Frontend cannot set or update `custom:tenant_id`.
- Public Cognito app client cannot write `custom:tenant_id` or `custom:role`.
- Registration app client secret is never exposed in frontend static config.
- Backend must reject tenant IDs that are reserved, invalid, or already used.
- Backend must normalize tenant IDs consistently.
- Protected APIs should stop falling back to `default-tenant` when an authenticated request lacks `custom:tenant_id`; return `403` instead.
- Public redirect routes may keep existing public behavior.
- Passwords are never stored or logged by the backend.
- Email verification is required before the user can successfully use protected app flows.
- Direct Cognito sign-up against the public Hosted UI app client must not produce a usable tenant-scoped account. Such users may exist in Cognito but protected APIs must fail with `403` because they lack `custom:tenant_id`.
- Public registration needs basic abuse controls for MVP:
  - per-IP throttling at API Gateway or application level when practical
  - structured logs for repeated registration failures
  - reserved tenant names to block impersonation
- Error messages should be clear but not leak more than necessary:
  - tenant conflict can be explicit
  - account/email conflict should be generic enough for MVP security
- Add structured logs without password or token values.

## Error Handling

- Invalid tenant name: `422` with a clear validation message.
- Tenant already exists: `409`.
- Cognito user already exists: return a registration conflict without exposing sensitive details.
- Cognito failure after tenant write: mark tenant as failed or delete the pending tenant record if safe.

## Testing

Backend tests:

- tenant slug normalization
- reserved tenant rejection
- duplicate tenant rejection
- successful registration calls Cognito adapter with server-controlled attributes
- hosted UI client configuration does not allow writing tenant attributes
- Cognito failure does not leave an active tenant
- authenticated tenant resolution returns `403` for missing tenant claim on protected routes

Frontend tests:

- register form renders required fields
- submit sends tenant name, email, and password to the API
- success state tells user to verify email
- conflict/error state is visible

## Non-Goals

- Billing or subscription gating
- Enterprise SSO
- Member invitation UI
- Role-based permissions beyond first owner claim
- Custom domain setup
- CAPTCHA or WAF automation

## Future Follow-Up

After public registration works, add tenant owner invitations:

- Owner enters email.
- Backend creates a Cognito user with `custom:tenant_id` and `custom:role=member`.
- Cognito sends invitation or verification email.
- User joins the existing tenant after verifying email.
