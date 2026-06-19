from datetime import UTC, datetime

from app.domain.models import ClickEvent, Link
from app.repositories.memory import (
    InMemoryAnalyticsAggregateRepository,
    InMemoryClickEventRepository,
    InMemoryLinkRepository,
)
from app.services.analytics import AnalyticsIngestionService, AnalyticsQueryService


def test_analytics_ingestion_updates_summary_dimensions_and_unique_visitors() -> None:
    events = InMemoryClickEventRepository()
    aggregates = InMemoryAnalyticsAggregateRepository()
    links = InMemoryLinkRepository()
    links.create(
        Link(
            tenant_id="tenant-a",
            slug="docs",
            target_url="https://example.com/docs",
            created_at=datetime(2026, 6, 1, tzinfo=UTC),
        )
    )
    links.create(
        Link(
            tenant_id="tenant-a",
            slug="launch",
            target_url="https://example.com/launch",
            created_at=datetime(2026, 6, 1, tzinfo=UTC),
        )
    )
    ingestion = AnalyticsIngestionService(events, aggregates)
    query = AnalyticsQueryService(events, aggregates, links)

    for slug, visitor_hash, country_code, device, browser, os_family, referrer in [
        ("docs", "visitor-1", "KR", "desktop", "chrome", "windows", "google.com"),
        ("docs", "visitor-1", "KR", "mobile", "safari", "ios", "direct"),
        ("launch", "visitor-2", "US", "mobile", "chrome", "android", "github.com"),
    ]:
        ingestion.record_event(
            ClickEvent(
                tenant_id="tenant-a",
                slug=slug,
                target_url=f"https://example.com/{slug}",
                occurred_at=datetime(2026, 6, 20, 12, 0, tzinfo=UTC),
                visitor_hash=visitor_hash,
                country_code=country_code,
                country={"KR": "South Korea", "US": "United States"}[country_code],
                city={"KR": "Seoul", "US": "New York"}[country_code],
                latitude=37.5665 if country_code == "KR" else 40.7128,
                longitude=126.978 if country_code == "KR" else -74.006,
                device_family=device,
                browser_family=browser,
                os_family=os_family,
                referrer=referrer,
            )
        )

    date_range = query.resolve_date_range(
        range_name="7d",
        today=datetime(2026, 6, 20, tzinfo=UTC).date(),
    )
    summary = query.get_summary(tenant_id="tenant-a", date_range=date_range)
    timeseries = query.get_timeseries(tenant_id="tenant-a", date_range=date_range)
    countries = query.get_breakdown(
        tenant_id="tenant-a",
        dimension="country",
        date_range=date_range,
    )
    top_links = query.get_top_links(tenant_id="tenant-a", date_range=date_range, limit=10)

    assert summary.total_clicks == 3
    assert summary.unique_visitors == 2
    assert summary.total_links == 2
    assert summary.active_links == 2
    assert summary.top_link == "docs"
    assert timeseries[-1].label == "2026-06-20"
    assert timeseries[-1].clicks == 3
    assert countries[0].key == "KR"
    assert countries[0].clicks == 2
    assert top_links[0].key == "docs"
    assert top_links[0].clicks == 2
