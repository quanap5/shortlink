# Production Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, multi-tenant analytics dashboard for ShortLink with traffic trends, geography, device/browser/OS/referrer breakdowns, top links, unique visitors, and dashboard summary metrics.

**Architecture:** Keep the repo constraints from `AGENTS.md`: FastAPI + Mangum + Lambda, DynamoDB, SQS, Cognito, CloudFront/S3, and Cloudflare DNS. Click redirects publish fail-soft analytics events to SQS; a consumer Lambda stores privacy-safe events and maintains query-optimized DynamoDB aggregate items so dashboard APIs avoid table scans. Frontend uses Next.js + TypeScript + Tailwind + Recharts to render protected analytics views.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, Mangum, DynamoDB, SQS, Lambda, AWS CDK, Cognito JWT, Next.js, TypeScript, Tailwind, Recharts, pytest, ruff.

---

## Scope And Constraint Notes

The attached spec mentions PostgreSQL RLS and SQL migrations. This repository is explicitly constrained to DynamoDB by `AGENTS.md`, so this plan implements the same product behavior using DynamoDB tenant-keyed access patterns and fail-closed service checks instead of PostgreSQL/RLS.

The current code already has:

- `GET /{slug}` redirect with async SQS click publishing.
- SQS consumer Lambda that persists click events to DynamoDB.
- Basic analytics APIs and a minimal frontend analytics page.
- `https://link.twinqx.com/{slug}` redirect routing through CloudFront.

This plan upgrades that foundation to production analytics without adding Redis, Kafka, Kubernetes, GraphQL, EC2, EKS, Route53, or microservices.

## Target API Shape

Use existing API Gateway base URL; frontend can expose these through client helpers:

- `GET /analytics/summary?range=7d|30d|90d&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `GET /analytics/timeseries?range=7d|30d|90d&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&grain=daily|weekly|monthly`
- `GET /analytics/geography?range=...`
- `GET /analytics/map?range=...`
- `GET /analytics/devices?range=...`
- `GET /analytics/browsers?range=...`
- `GET /analytics/os?range=...`
- `GET /analytics/referrers?range=...`
- `GET /analytics/top-links?range=...&limit=10|50`
- `GET /links/{slug}/analytics?range=...`

All endpoints must be protected by Cognito JWT and scoped to the resolved `tenant_id`.

## DynamoDB Design

Keep current tables and add one aggregate table:

### Existing `LinksTable`

Keys:

- partition key: `tenant_id`
- sort key: `slug`

### Existing `ClickEventsTable`

Keys:

- partition key: `tenant_id`
- sort key: `slug_occurred_at`

Store event attributes:

- `tenant_id`
- `slug`
- `target_url`
- `occurred_at`
- `visitor_hash`
- `ip_hash`
- `referer`
- `country`
- `country_code`
- `region`
- `city`
- `latitude`
- `longitude`
- `device_family`
- `browser_family`
- `os_family`
- `user_agent_hash`

Never store raw IP. Avoid returning raw user agent.

### New `AnalyticsAggregatesTable`

Keys:

- partition key: `tenant_id`
- sort key: `metric_key`

Suggested `metric_key` values:

- `summary#YYYY-MM-DD`
- `link#<slug>#YYYY-MM-DD`
- `country#<country_code>#YYYY-MM-DD`
- `city#<country_code>#<city>#YYYY-MM-DD`
- `device#<device_family>#YYYY-MM-DD`
- `browser#<browser_family>#YYYY-MM-DD`
- `os#<os_family>#YYYY-MM-DD`
- `referrer#<source>#YYYY-MM-DD`
- `visitor#<visitor_hash>#YYYY-MM-DD`

Each item stores `clicks` as an atomic counter and the relevant display labels.

This keeps the MVP within DynamoDB while supporting 1M events and dashboard queries without scans.

---

### Task 1: Analytics Event Model And Privacy Contract

**Files:**
- Modify: `backend/app/domain/models.py`
- Modify: `backend/app/repositories/sqs.py`
- Modify: `backend/app/services/links.py`
- Modify: `backend/tests/test_link_services.py`
- Modify: `backend/tests/test_sqs_click_event_publisher.py`

- [ ] **Step 1: Add failing tests for privacy-safe click metadata**

Add these tests to `backend/tests/test_link_services.py`:

```python
def test_click_event_hashes_ip_and_never_stores_raw_ip() -> None:
    events = InMemoryClickEventRepository()
    service = ClickEventService(events)

    event = service.record_click(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        user_agent="Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
        ip_address="203.0.113.10",
        country_code="KR",
        referer="https://google.com/search?q=shortlink",
    )

    assert event.ip_hash is not None
    assert event.ip_hash != "203.0.113.10"
    assert event.visitor_hash is not None
    assert event.referer == "google.com"
    assert event.os_family == "windows"
```

Add this test to `backend/tests/test_sqs_click_event_publisher.py`:

```python
def test_sqs_click_event_payload_excludes_raw_ip_and_raw_user_agent() -> None:
    client = FakeSQSClient()
    publisher = SQSClickEventPublisher("https://sqs.example/queue", sqs_client=client)
    event = ClickEvent(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        occurred_at=utc_now(),
        ip_hash="hash-ip",
        visitor_hash="hash-visitor",
        user_agent_hash="hash-ua",
        device_family="desktop",
        browser_family="chrome",
        os_family="windows",
        referer="direct",
    )

    publisher.publish(event)

    body = json.loads(client.messages[0]["MessageBody"])
    assert "ip_address" not in body
    assert "user_agent" not in body
    assert body["ip_hash"] == "hash-ip"
    assert body["user_agent_hash"] == "hash-ua"
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest tests/test_link_services.py tests/test_sqs_click_event_publisher.py -v
```

Expected: fail because `ClickEvent` lacks privacy fields, referer normalization, OS parsing, and hash logic.

- [ ] **Step 3: Update domain model**

In `backend/app/domain/models.py`, extend `ClickEvent`:

```python
@dataclass(frozen=True)
class ClickEvent:
    tenant_id: str
    slug: str
    target_url: str
    occurred_at: datetime
    visitor_hash: str | None = None
    ip_hash: str | None = None
    user_agent_hash: str | None = None
    referer: str = "direct"
    country: str | None = None
    country_code: str | None = None
    region: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    device_family: str = "unknown"
    browser_family: str = "unknown"
    os_family: str = "unknown"
```

Remove raw `ip_address` from the stored event model. Keep raw `user_agent` out of the domain model or replace it with `user_agent_hash`.

- [ ] **Step 4: Implement normalization helpers**

In `backend/app/services/links.py`, add:

```python
def sha256_text(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def normalize_referer(referer: str | None) -> str:
    if not referer:
        return "direct"
    parsed = urlparse(referer)
    return parsed.hostname or "direct"

def classify_os(user_agent: str | None) -> str:
    value = (user_agent or "").lower()
    if "windows" in value:
        return "windows"
    if "mac os" in value or "macintosh" in value:
        return "macos"
    if "android" in value:
        return "android"
    if "iphone" in value or "ipad" in value or "ios" in value:
        return "ios"
    if "linux" in value:
        return "linux"
    return "other"
```

Update `ClickEventService.record_click(...)` to accept `referer`, `visitor_id`, `ip_address`, `user_agent`, and optional geo fields, then store only hashes/normalized fields.

- [ ] **Step 5: Verify**

Run:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest tests/test_link_services.py tests/test_sqs_click_event_publisher.py -v
.\.venv\Scripts\python.exe -m ruff check .
```

---

### Task 2: Fail-Soft Redirect Analytics Capture

**Files:**
- Modify: `backend/app/api/routes.py`
- Modify: `backend/app/services/links.py`
- Modify: `backend/tests/test_link_services.py`

- [ ] **Step 1: Add failing test for fail-soft click publishing**

Add to `backend/tests/test_link_services.py`:

```python
class FailingClickEventPublisher:
    def publish(self, event: ClickEvent) -> ClickEvent:
        raise RuntimeError("sqs unavailable")


def test_click_event_service_fail_soft_when_publisher_fails() -> None:
    service = ClickEventService(FailingClickEventPublisher())

    event = service.record_click(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        user_agent="Mozilla/5.0",
        ip_address="203.0.113.10",
    )

    assert event.slug == "docs"
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest tests/test_link_services.py::test_click_event_service_fail_soft_when_publisher_fails -v
```

Expected: fail because publisher exception bubbles up.

- [ ] **Step 3: Implement fail-soft publishing**

In `ClickEventService.record_click`, wrap `self._click_events.publish(event)`:

```python
try:
    return self._click_events.publish(event)
except Exception:
    logger.exception("click_event_publish_failed tenant_id=%s slug=%s", tenant_id, slug)
    return event
```

- [ ] **Step 4: Capture request metadata in route**

In `backend/app/api/routes.py`, pass:

```python
referer=request.headers.get("referer"),
visitor_id=request.cookies.get("shortlink_vid"),
ip_address=request.client.host if request.client else None,
user_agent=request.headers.get("user-agent"),
country_code=request.headers.get("cloudfront-viewer-country"),
region=request.headers.get("cloudfront-viewer-country-region"),
city=request.headers.get("cloudfront-viewer-city"),
```

Do not put parsing business logic inside the route.

- [ ] **Step 5: Verify**

Run all backend tests and ruff.

---

### Task 3: GeoIP And User-Agent Enrichment

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/services/links.py`
- Create: `backend/tests/test_analytics_enrichment.py`

- [ ] **Step 1: Add dependency decision**

Use no external GeoIP database in MVP unless a database file and license are provided. Prefer CloudFront headers for country/region/city because the stack already uses CloudFront. This avoids shipping MaxMind databases in Lambda and avoids licensing surprises.

Add no GeoIP package in this task.

- [ ] **Step 2: Add tests for parser coverage**

Create `backend/tests/test_analytics_enrichment.py`:

```python
from app.services.links import classify_browser, classify_device, classify_os, normalize_referer


def test_classifies_samsung_internet() -> None:
    ua = "Mozilla/5.0 Linux Android 14 SamsungBrowser/24.0 Chrome/120.0 Mobile"
    assert classify_device(ua) == "mobile"
    assert classify_browser(ua) == "samsung_internet"
    assert classify_os(ua) == "android"


def test_classifies_opera() -> None:
    ua = "Mozilla/5.0 Windows NT 10.0 OPR/105.0 Chrome/120.0"
    assert classify_browser(ua) == "opera"
    assert classify_os(ua) == "windows"


def test_normalizes_referer_to_host() -> None:
    assert normalize_referer("https://www.google.com/search?q=x") == "www.google.com"
    assert normalize_referer(None) == "direct"
```

- [ ] **Step 3: Implement parser updates**

Support browser outputs:

- `chrome`
- `edge`
- `firefox`
- `safari`
- `samsung_internet`
- `opera`
- `bot`
- `other`

Support OS outputs:

- `windows`
- `macos`
- `linux`
- `android`
- `ios`
- `other`

- [ ] **Step 4: Verify**

Run:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest tests/test_analytics_enrichment.py -v
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
```

---

### Task 4: DynamoDB Aggregate Table

**Files:**
- Modify: `infra/lib/shortlink-stack.ts`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/repositories/interfaces.py`
- Modify: `backend/app/repositories/dynamodb.py`
- Modify: `backend/app/repositories/memory.py`
- Create: `backend/tests/test_analytics_aggregates.py`

- [ ] **Step 1: Add aggregate repository interface tests**

Create `backend/tests/test_analytics_aggregates.py`:

```python
from app.domain.models import ClickEvent
from app.repositories.memory import InMemoryAnalyticsAggregateRepository
from app.services.analytics import AnalyticsIngestionService


def test_ingestion_updates_daily_aggregates() -> None:
    aggregates = InMemoryAnalyticsAggregateRepository()
    service = AnalyticsIngestionService(click_events=None, aggregates=aggregates)
    event = ClickEvent(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        occurred_at=datetime.fromisoformat("2026-06-20T10:00:00+00:00"),
        visitor_hash="visitor-1",
        country_code="KR",
        country="South Korea",
        city="Seoul",
        device_family="mobile",
        browser_family="chrome",
        os_family="android",
        referer="google.com",
    )

    service.record_event(event)

    assert aggregates.get_count("tenant-a", "summary#2026-06-20") == 1
    assert aggregates.get_count("tenant-a", "link#docs#2026-06-20") == 1
    assert aggregates.get_count("tenant-a", "visitor#visitor-1#2026-06-20") == 1
```

- [ ] **Step 2: Add CDK table**

In `infra/lib/shortlink-stack.ts`, add:

```typescript
const analyticsAggregatesTable = new dynamodb.Table(this, "AnalyticsAggregatesTable", {
  partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "metric_key", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

Add environment:

```typescript
SHORTLINK_ANALYTICS_AGGREGATES_TABLE_NAME: analyticsAggregatesTable.tableName
```

Grant read/write to backend and consumer Lambdas.

- [ ] **Step 3: Add settings**

In `backend/app/core/config.py`:

```python
analytics_aggregates_table_name: str | None = Field(default=None)
```

- [ ] **Step 4: Implement aggregate repository**

Add `AnalyticsAggregateRepository` to `backend/app/repositories/interfaces.py`:

```python
class AnalyticsAggregateRepository(ABC):
    @abstractmethod
    def increment(self, tenant_id: str, metric_key: str, amount: int = 1, labels: dict[str, str] | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def query_by_prefix(self, tenant_id: str, prefix: str) -> list[AnalyticsAggregate]:
        raise NotImplementedError
```

Implement DynamoDB `UpdateItem ADD clicks :amount` with labels stored through `SET`.

- [ ] **Step 5: Verify**

Run backend tests, ruff, and infra synth.

---

### Task 5: Analytics Query Services And Response Schemas

**Files:**
- Modify: `backend/app/schemas/analytics.py`
- Modify: `backend/app/services/analytics.py`
- Modify: `backend/tests/test_analytics_services.py`

- [ ] **Step 1: Add tests for date ranges**

Add tests:

```python
def test_range_7d_builds_inclusive_dates() -> None:
    date_range = AnalyticsDateRange.from_query(range_value="7d", today=date(2026, 6, 20))
    assert date_range.start == date(2026, 6, 14)
    assert date_range.end == date(2026, 6, 20)
```

```python
def test_custom_range_rejects_end_before_start() -> None:
    with pytest.raises(ValueError):
        AnalyticsDateRange.from_query(start_date="2026-06-20", end_date="2026-06-01")
```

- [ ] **Step 2: Define schemas**

In `backend/app/schemas/analytics.py`, add:

```python
class AnalyticsSummaryResponse(BaseModel):
    total_clicks: int
    unique_visitors: int
    total_links: int
    active_links: int
    top_link: str | None
    click_growth_percent: float

class TimeseriesPointResponse(BaseModel):
    date: str
    clicks: int

class TimeseriesResponse(BaseModel):
    points: list[TimeseriesPointResponse]

class BreakdownItemResponse(BaseModel):
    label: str
    clicks: int

class MapPointResponse(BaseModel):
    lat: float
    lng: float
    clicks: int
```

- [ ] **Step 3: Implement query service methods**

In `AnalyticsQueryService`, implement:

- `get_summary(tenant_id, date_range)`
- `get_timeseries(tenant_id, date_range, grain)`
- `get_geography(tenant_id, date_range)`
- `get_map_points(tenant_id, date_range)`
- `get_devices(tenant_id, date_range)`
- `get_browsers(tenant_id, date_range)`
- `get_os(tenant_id, date_range)`
- `get_referrers(tenant_id, date_range)`
- `get_top_links(tenant_id, date_range, limit)`

All methods must read aggregate prefixes by `tenant_id`.

- [ ] **Step 4: Verify**

Run:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest tests/test_analytics_services.py -v
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .
```

---

### Task 6: Protected Analytics REST APIs

**Files:**
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/routes.py`
- Create: `backend/tests/test_analytics_routes.py`

- [ ] **Step 1: Add route tests with dependency overrides**

Create `backend/tests/test_analytics_routes.py` using FastAPI `TestClient`:

```python
def test_summary_route_requires_tenant_scoped_service() -> None:
    app.dependency_overrides[get_tenant_id] = lambda: "tenant-a"
    app.dependency_overrides[get_analytics_query_service] = lambda: FakeAnalyticsQueryService()

    response = client.get("/analytics/summary?range=7d")

    assert response.status_code == 200
    assert response.json()["total_clicks"] == 10
    assert FakeAnalyticsQueryService.last_tenant_id == "tenant-a"
```

Add tests for invalid range and invalid top-link limit.

- [ ] **Step 2: Add route dependencies**

In `backend/app/api/dependencies.py`, wire:

```python
def get_analytics_aggregate_repository() -> AnalyticsAggregateRepository:
    ...

def get_analytics_query_service() -> AnalyticsQueryService:
    return AnalyticsQueryService(
        click_events=get_click_event_repository(),
        links=get_link_repository(),
        aggregates=get_analytics_aggregate_repository(),
    )
```

- [ ] **Step 3: Add endpoints**

In `backend/app/api/routes.py`, add:

```python
@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
@router.get("/analytics/timeseries", response_model=TimeseriesResponse)
@router.get("/analytics/geography", response_model=GeographyResponse)
@router.get("/analytics/map", response_model=list[MapPointResponse])
@router.get("/analytics/devices", response_model=dict[str, int])
@router.get("/analytics/browsers", response_model=dict[str, int])
@router.get("/analytics/os", response_model=dict[str, int])
@router.get("/analytics/referrers", response_model=list[BreakdownItemResponse])
@router.get("/analytics/top-links", response_model=list[TopLinkResponse])
```

Each route must only parse query params and delegate.

- [ ] **Step 4: Protect routes in CDK**

In `infra/lib/shortlink-stack.ts`, add JWT-protected routes:

```typescript
for (const path of [
  "/analytics/summary",
  "/analytics/timeseries",
  "/analytics/geography",
  "/analytics/map",
  "/analytics/devices",
  "/analytics/browsers",
  "/analytics/os",
  "/analytics/referrers",
  "/analytics/top-links",
]) {
  api.addRoutes({
    path,
    methods: [apigatewayv2.HttpMethod.GET],
    integration: backendIntegration,
    authorizer: jwtAuthorizer,
  });
}
```

- [ ] **Step 5: Verify**

Run backend tests, ruff, infra build, and infra synth.

---

### Task 7: Seed Data For Analytics Development

**Files:**
- Create: `backend/app/dev/seed_analytics.py`
- Create: `backend/tests/test_seed_analytics.py`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Create deterministic seed generator**

Create `backend/app/dev/seed_analytics.py`:

```python
def build_seed_events(
    tenant_id: str,
    slug: str,
    start: datetime,
    days: int,
    clicks_per_day: int,
) -> list[ClickEvent]:
    ...
```

Use deterministic cycling through:

- countries: KR, US, VN, JP
- devices: desktop, mobile, tablet
- browsers: chrome, safari, edge, firefox
- os: windows, macos, android, ios
- referrers: direct, google.com, facebook.com, linkedin.com

- [ ] **Step 2: Add tests**

```python
def test_build_seed_events_is_deterministic() -> None:
    first = build_seed_events("tenant-a", "docs", datetime(2026, 6, 1, tzinfo=UTC), 2, 3)
    second = build_seed_events("tenant-a", "docs", datetime(2026, 6, 1, tzinfo=UTC), 2, 3)

    assert first == second
    assert len(first) == 6
```

- [ ] **Step 3: Add CLI entrypoint**

Support:

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m app.dev.seed_analytics --tenant default-tenant --slug docs --days 30 --clicks-per-day 20
```

This should publish seed events to SQS when `SHORTLINK_CLICK_EVENTS_QUEUE_URL` is set.

- [ ] **Step 4: Verify**

Run seed tests and backend suite.

---

### Task 8: Frontend API Client And Types

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/lib/analytics.ts`

- [ ] **Step 1: Add analytics types**

Create `frontend/lib/analytics.ts`:

```typescript
export type AnalyticsRange = "7d" | "30d" | "90d" | "custom";

export type DateRangeQuery = {
  range: AnalyticsRange;
  startDate?: string;
  endDate?: string;
};

export type AnalyticsSummary = {
  total_clicks: number;
  unique_visitors: number;
  total_links: number;
  active_links: number;
  top_link: string | null;
  click_growth_percent: number;
};
```

Add matching types for timeseries, breakdown rows, map points, and top links.

- [ ] **Step 2: Add API functions**

In `frontend/lib/api.ts`, add:

```typescript
function withAnalyticsParams(path: string, query: DateRangeQuery): string {
  const params = new URLSearchParams();
  params.set("range", query.range);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  return `${path}?${params.toString()}`;
}

export async function getAnalyticsSummary(query: DateRangeQuery): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>(withAnalyticsParams("/analytics/summary", query));
}
```

Add functions for every endpoint.

- [ ] **Step 3: Verify TypeScript**

Run:

```powershell
cd E:\Startup\shortlink\frontend
npm.cmd run lint
npm.cmd run build
```

Expected: pass.

---

### Task 9: Recharts Dependency And Dashboard Route

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/app/dashboard/analytics/page.tsx`
- Modify: `frontend/app/analytics/page.tsx`
- Modify: `frontend/components/Shell.tsx`

- [ ] **Step 1: Install Recharts**

Run:

```powershell
cd E:\Startup\shortlink\frontend
npm.cmd install recharts
```

This updates `package.json` and `package-lock.json`.

- [ ] **Step 2: Move analytics route**

Create `frontend/app/dashboard/analytics/page.tsx` as the production route.

Make `frontend/app/analytics/page.tsx` a thin redirect or link page:

```tsx
import { redirect } from "next/navigation";

export default function AnalyticsRedirectPage() {
  redirect("/dashboard/analytics");
}
```

Because this app statically exports pages, if Next static redirect is not supported, render a link button to `/dashboard/analytics` instead.

- [ ] **Step 3: Update navigation**

In `frontend/components/Shell.tsx`, change Analytics nav href from `/analytics` to `/dashboard/analytics`.

- [ ] **Step 4: Verify**

Run frontend lint/build.

---

### Task 10: Dashboard Widgets And Charts

**Files:**
- Create: `frontend/components/analytics/RangePicker.tsx`
- Create: `frontend/components/analytics/KpiCards.tsx`
- Create: `frontend/components/analytics/TrendChart.tsx`
- Create: `frontend/components/analytics/BreakdownChart.tsx`
- Create: `frontend/components/analytics/TopLinksTable.tsx`
- Create: `frontend/components/analytics/ReferrersTable.tsx`
- Modify: `frontend/app/dashboard/analytics/page.tsx`

- [ ] **Step 1: Create range picker**

Use buttons or segmented controls for:

- `7d`
- `30d`
- `90d`
- `custom`

For custom, show two date inputs.

- [ ] **Step 2: Create KPI cards**

Cards:

- Total Clicks
- Unique Visitors
- Total Links
- Active Links
- Top Link
- Click Growth %

Use compact dashboard styling, not marketing-style hero layout.

- [ ] **Step 3: Create Recharts components**

Use:

- `LineChart` for trend
- `PieChart` for devices/browsers/OS
- `BarChart` for countries/cities/top links

Each chart must handle empty data with a quiet empty state.

- [ ] **Step 4: Wire dashboard data loading**

In `frontend/app/dashboard/analytics/page.tsx`:

```tsx
const [query, setQuery] = useState<DateRangeQuery>({ range: "7d" });
const [data, setData] = useState<AnalyticsDashboardData | null>(null);
const [error, setError] = useState<string | null>(null);
const [isLoading, setIsLoading] = useState(true);
```

Fetch all analytics endpoints in parallel with `Promise.all`.

- [ ] **Step 5: Verify**

Run frontend lint/build.

---

### Task 11: Integration Tests And API Smoke Checks

**Files:**
- Create: `backend/tests/test_analytics_integration.py`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Add in-memory integration test**

Test flow:

1. Create link.
2. Record multiple click events through ingestion service.
3. Query summary/timeseries/top-links.
4. Assert tenant isolation.

Use in-memory repositories only.

- [ ] **Step 2: Add deployment smoke checklist**

In `docs/DEPLOYMENT.md`, add:

```powershell
curl.exe -I https://link.twinqx.com/login
curl.exe -I https://link.twinqx.com/dashboard/analytics
curl.exe -i https://6fxgd9257b.execute-api.ap-northeast-2.amazonaws.com/analytics/summary
```

Expected:

- frontend routes return 200
- API without token returns 401

- [ ] **Step 3: Verify**

Run backend tests, frontend build, infra synth.

---

### Task 12: Deploy And Production Verification

**Files:**
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Run full local checks**

```powershell
cd E:\Startup\shortlink\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .

cd E:\Startup\shortlink\frontend
npm.cmd run lint
npm.cmd run build

cd E:\Startup\shortlink\infra
npm.cmd run build
npm.cmd run synth
```

- [ ] **Step 2: Deploy**

```powershell
cd E:\Startup\shortlink\infra
npx.cmd cdk deploy --require-approval never
```

- [ ] **Step 3: Seed production-like data**

Use the seed script for a non-critical tenant/slug:

```powershell
cd E:\Startup\shortlink\backend
$env:SHORTLINK_CLICK_EVENTS_QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/373249432962/ShortLinkStack-ClickEventsQueue376F5AB2-dqBdrvh5bAjh"
.\.venv\Scripts\python.exe -m app.dev.seed_analytics --tenant default-tenant --slug docs --days 30 --clicks-per-day 20
```

- [ ] **Step 4: Browser smoke test**

1. Open `https://link.twinqx.com/login`.
2. Sign in with Cognito.
3. Open `https://link.twinqx.com/dashboard/analytics`.
4. Select 7d, 30d, 90d.
5. Confirm KPI cards, trend chart, countries, cities, device, browser, OS, referrers, and top links render.

- [ ] **Step 5: API smoke test**

With a valid access token:

```powershell
curl.exe -H "Authorization: Bearer <token>" "https://6fxgd9257b.execute-api.ap-northeast-2.amazonaws.com/analytics/summary?range=30d"
curl.exe -H "Authorization: Bearer <token>" "https://6fxgd9257b.execute-api.ap-northeast-2.amazonaws.com/analytics/timeseries?range=30d&grain=daily"
curl.exe -H "Authorization: Bearer <token>" "https://6fxgd9257b.execute-api.ap-northeast-2.amazonaws.com/analytics/top-links?range=30d&limit=10"
```

Expected: 200 responses with tenant-scoped data only.

---

## Execution Order

1. Task 1: privacy-safe event model.
2. Task 2: fail-soft redirect analytics capture.
3. Task 3: parser/enrichment coverage.
4. Task 4: DynamoDB aggregate table.
5. Task 5: analytics query service and schemas.
6. Task 6: protected REST APIs.
7. Task 7: seed data.
8. Task 8: frontend API client.
9. Task 9: Recharts and `/dashboard/analytics` route.
10. Task 10: dashboard widgets/charts.
11. Task 11: integration tests and smoke docs.
12. Task 12: deploy and verify.

## Risk Register

- **Tenant isolation:** Must fail closed. Analytics APIs must never default to broad queries.
- **Raw IP exposure:** Store only hashes. Do not return raw IP or user-agent.
- **DynamoDB hot keys:** Aggregates use per-day metric keys. For high traffic, add sharded counters later, but not in MVP.
- **CloudFront geo detail:** CloudFront reliably provides country; city/lat/lng may need additional headers or a later GeoIP database. Do not fake city/map data.
- **Static export constraints:** Next.js redirects may not work in static export. Use explicit link page if needed.
- **Dirty working tree:** Current repo has uncommitted deployed changes. Commit or branch before executing this plan.

