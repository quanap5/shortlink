# Architecture Notes

## MVP Flow

```text
User
  ↓
Cloudflare DNS
  ↓
AWS CloudFront
  ↓
Frontend S3 / API Gateway
  ↓
Lambda FastAPI
  ↓
DynamoDB
```

Click events are modeled as a separate service. Redirect handling publishes click events to SQS when `SHORTLINK_CLICK_EVENTS_QUEUE_URL` is configured. A later worker should consume the queue and persist events into the click-events DynamoDB table.

## Tenant Isolation

All link and click-event data is keyed by `tenant_id`.

- Links table: partition key `tenant_id`, sort key `slug`.
- Click events table: partition key `tenant_id`, sort key `slug_occurred_at`.
- API Phase 1 uses a placeholder tenant dependency.
- API Phase 2 should derive tenant identity from Cognito claims.

## Boundaries

- API routes parse HTTP requests and delegate business logic.
- Services own link creation, redirect lookup, and click event behavior.
- Repositories isolate persistence concerns.
- Publishers isolate asynchronous event delivery concerns.
- Domain models stay framework-independent.

## Out of Scope

Billing, custom domains, enterprise SSO, Route53, Redis, Kafka, Kubernetes, EKS, EC2, GraphQL, and microservices are outside the MVP.
