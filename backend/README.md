# ShortLink Backend

FastAPI MVP skeleton for AWS Lambda through Mangum.

## Local commands

```bash
pytest
ruff check .
uvicorn app.main:app --reload
```

Tenant isolation is modeled through `tenant_id` on all repository keys. Phase 1 uses a placeholder tenant dependency; Phase 2 should derive the tenant from Cognito claims.

Redirect click events are published to SQS when `SHORTLINK_CLICK_EVENTS_QUEUE_URL` is set. Without that setting, local development uses an in-memory publisher.
