from app.domain.models import ClickEvent, utc_now
from app.repositories.memory import InMemoryClickEventRepository
from app.services.analytics import AnalyticsIngestionService, AnalyticsQueryService


def test_link_analytics_summary_counts_hits_and_dimensions() -> None:
    events = InMemoryClickEventRepository()
    ingestion = AnalyticsIngestionService(events)
    query = AnalyticsQueryService(events)

    for country, device, browser in [
        ("KR", "desktop", "chrome"),
        ("KR", "mobile", "safari"),
        ("US", "mobile", "chrome"),
    ]:
        ingestion.record_event(
            ClickEvent(
                tenant_id="tenant-a",
                slug="docs",
                target_url="https://example.com/docs",
                occurred_at=utc_now(),
                country_code=country,
                device_family=device,
                browser_family=browser,
            )
        )

    summary = query.get_link_analytics(tenant_id="tenant-a", slug="docs")

    assert summary.total_hits == 3
    assert summary.by_country == {"KR": 2, "US": 1}
    assert summary.by_device == {"desktop": 1, "mobile": 2}
    assert summary.by_browser == {"chrome": 2, "safari": 1}
    assert len(summary.recent_events) == 3


def test_analytics_summaries_are_tenant_isolated() -> None:
    events = InMemoryClickEventRepository()
    ingestion = AnalyticsIngestionService(events)
    query = AnalyticsQueryService(events)

    ingestion.record_event(
        ClickEvent(
            tenant_id="tenant-a",
            slug="docs",
            target_url="https://example.com/docs",
            occurred_at=utc_now(),
            device_family="desktop",
            browser_family="chrome",
        )
    )
    ingestion.record_event(
        ClickEvent(
            tenant_id="tenant-b",
            slug="docs",
            target_url="https://example.com/docs",
            occurred_at=utc_now(),
            device_family="mobile",
            browser_family="safari",
        )
    )

    summaries = query.list_link_summaries(tenant_id="tenant-a")

    assert len(summaries) == 1
    assert summaries[0].slug == "docs"
    assert summaries[0].total_hits == 1
