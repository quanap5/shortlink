from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class Link:
    tenant_id: str
    slug: str
    target_url: str
    created_at: datetime
    created_by: str | None = None


@dataclass(frozen=True)
class ClickEvent:
    tenant_id: str
    slug: str
    target_url: str
    occurred_at: datetime
    visitor_hash: str | None = None
    ip_hash: str | None = None
    user_agent_hash: str | None = None
    country_code: str | None = None
    country: str | None = None
    region: str | None = None
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    referrer: str = "direct"
    device_family: str = "unknown"
    browser_family: str = "unknown"
    os_family: str = "unknown"


@dataclass(frozen=True)
class AnalyticsAggregate:
    tenant_id: str
    metric_key: str
    clicks: int
    labels: dict[str, str]


@dataclass(frozen=True)
class LinkAnalyticsSummary:
    tenant_id: str
    slug: str
    total_hits: int
    by_country: dict[str, int]
    by_device: dict[str, int]
    by_browser: dict[str, int]
    recent_events: list[ClickEvent]


@dataclass(frozen=True)
class LinkAnalyticsListItem:
    slug: str
    total_hits: int
    by_country: dict[str, int]
    by_device: dict[str, int]
    by_browser: dict[str, int]


@dataclass(frozen=True)
class AnalyticsSummary:
    total_clicks: int
    unique_visitors: int
    total_links: int
    active_links: int
    top_link: str | None
    top_link_clicks: int
    click_growth_percent: float


@dataclass(frozen=True)
class AnalyticsPoint:
    label: str
    clicks: int


@dataclass(frozen=True)
class AnalyticsBreakdownItem:
    key: str
    label: str
    clicks: int
    metadata: dict[str, str]


def utc_now() -> datetime:
    return datetime.now(tz=UTC)
