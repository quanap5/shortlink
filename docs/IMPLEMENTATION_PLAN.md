# ShortLink SaaS Implementation Plan

## Scope
Build an MVP skeleton based on `docs/SRS.md` and `AGENTS.md`.

The MVP uses Cloudflare DNS outside AWS and must not create Route53 resources.

## Non-Goals
- Billing
- Custom domains
- Enterprise SSO
- Kubernetes, Kafka, Redis, EKS, EC2, GraphQL, or microservices
- Production-grade observability, rate limiting, or deployment automation

## Phase 1 - Repository Bootstrap
Create a working skeleton with clear boundaries and tests for backend core logic.

### Backend
- FastAPI application with Mangum Lambda adapter.
- Pydantic v2 request/response schemas.
- Domain models for links and click events.
- Repository abstractions for tenant-isolated link storage and click events.
- In-memory repositories for tests and local development.
- DynamoDB repository implementation shell for AWS runtime.
- Services for link creation, redirect lookup, and click event recording.
- API routes that delegate business logic to services.
- Pytest coverage for core service behavior.

### Frontend
- Next.js TypeScript app skeleton.
- Tailwind configuration.
- Dashboard landing view.
- Login placeholder.
- Create link page.
- Link list page.
- Analytics placeholder.

### Infrastructure
- AWS CDK app and stack.
- S3 bucket for static frontend hosting.
- CloudFront distribution.
- API Gateway HTTP API.
- Lambda function for FastAPI backend.
- DynamoDB tables for links and click events.
- SQS queue for click events.
- Cognito user pool.
- No Route53 resources.
- Cloudflare DNS setup documented in `docs/CLOUDFLARE_DNS.md`.

## Phase 2 - MVP Behavior
- Persist link creation to DynamoDB.
- Wire redirect flow to publish click events through SQS. (Started: backend publisher abstraction exists.)
- Add a queue consumer that stores click events in DynamoDB.
- Add Cognito-backed authentication to frontend and API.
- Add deployment configuration and environment handling.

## Phase 3 - Hardening
- Add structured production logging defaults.
- Add CI commands for backend and frontend.
- Add frontend tests.
- Add operational runbooks and local developer docs.
