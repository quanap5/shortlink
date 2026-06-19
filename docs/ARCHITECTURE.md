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

Click events are modeled as a separate service. Redirect handling publishes sanitized click
events to SQS when `SHORTLINK_CLICK_EVENTS_QUEUE_URL` is configured. The click event consumer
Lambda reads SQS records, persists normalized events into the click-events DynamoDB table, and
updates tenant-scoped aggregate counters for the protected analytics dashboard.

## Shorten And Redirect Flow

```text
Authenticated user
  -> POST /links
  -> LinkCreationService
  -> LinksTable
```

If a custom slug is omitted, the backend generates a URL-safe slug and retries on collisions.

```text
Visitor
  -> GET /{slug}
  -> RedirectService
  -> SQS click event
  -> 307 redirect to original URL
```

Generated short URLs use `https://link.twinqx.com/{slug}`. CloudFront routes known frontend paths such as `/login`, `/links`, `/analytics`, `/auth/*`, and static assets to S3. Other root paths such as `/docs` route to the API Gateway redirect endpoint.

## Analytics Flow

```text
SQS ClickEventsQueue
  -> ClickEventConsumerFunction
  -> ClickEventsTable
  -> AnalyticsAggregatesTable
  -> GET /analytics/summary
  -> GET /analytics/timeseries
  -> GET /analytics/breakdowns/{dimension}
  -> GET /analytics/top-links
  -> Frontend /dashboard/analytics
```

Analytics include total clicks, unique visitors, total links, active links, top links,
traffic trend, country, city, device, browser, OS, and referrer breakdowns. The redirect
path hashes visitor ID, IP, and user-agent data before publishing a click event. Raw IP
addresses and raw user-agent strings are not stored or exposed by analytics APIs.

## Tenant Isolation

All link and click-event data is keyed by `tenant_id`.

- Links table: partition key `tenant_id`, sort key `slug`.
- Click events table: partition key `tenant_id`, sort key `slug_occurred_at`.
- Analytics aggregates table: partition key `tenant_id`, sort key `metric_key`.
- API derives tenant identity from Cognito claims when available.
- The current MVP falls back to `default-tenant` when no tenant claim exists to preserve existing public redirect behavior.

## Boundaries

- API routes parse HTTP requests and delegate business logic.
- Services own link creation, redirect lookup, and click event behavior.
- Repositories isolate persistence concerns.
- Publishers isolate asynchronous event delivery concerns.
- Domain models stay framework-independent.

## Out of Scope

Billing, custom domains, enterprise SSO, Route53, Redis, Kafka, Kubernetes, EKS, EC2, GraphQL, and microservices are outside the MVP.
