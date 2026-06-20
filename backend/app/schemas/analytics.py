from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ClickEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    target_url: str
    occurred_at: datetime
    country_code: str | None = None
    device_family: str
    browser_family: str
    source: str


class LinkAnalyticsResponse(BaseModel):
    slug: str
    total_hits: int
    by_country: dict[str, int]
    by_device: dict[str, int]
    by_browser: dict[str, int]
    recent_events: list[ClickEventResponse]


class AnalyticsLinkSummaryResponse(BaseModel):
    slug: str
    total_hits: int
    by_country: dict[str, int]
    by_device: dict[str, int]
    by_browser: dict[str, int]


class AnalyticsLinksResponse(BaseModel):
    links: list[AnalyticsLinkSummaryResponse]


class AnalyticsSummaryResponse(BaseModel):
    total_clicks: int
    unique_visitors: int
    total_links: int
    active_links: int
    top_link: str | None
    top_link_clicks: int
    click_growth_percent: float


class AnalyticsPointResponse(BaseModel):
    label: str
    clicks: int


class AnalyticsTimeseriesResponse(BaseModel):
    points: list[AnalyticsPointResponse]


class AnalyticsBreakdownItemResponse(BaseModel):
    key: str
    label: str
    clicks: int
    metadata: dict[str, str]


class AnalyticsBreakdownResponse(BaseModel):
    items: list[AnalyticsBreakdownItemResponse]
