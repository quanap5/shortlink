from datetime import UTC, datetime, timedelta

from app.domain.models import ClickEvent, Link
from app.repositories.memory import (
    InMemoryAnalyticsAggregateRepository,
    InMemoryClickEventRepository,
    InMemoryLinkRepository,
)
from app.services.analytics import AnalyticsIngestionService, AnalyticsQueryService


def main() -> None:
    links = InMemoryLinkRepository()
    events = InMemoryClickEventRepository()
    aggregates = InMemoryAnalyticsAggregateRepository()
    ingestion = AnalyticsIngestionService(events, aggregates)
    query = AnalyticsQueryService(events, aggregates, links)
    tenant_id = "default-tenant"
    today = datetime.now(tz=UTC).date()

    for slug in ["docs", "launch", "pricing"]:
        links.create(
            Link(
                tenant_id=tenant_id,
                slug=slug,
                target_url=f"https://example.com/{slug}",
                created_at=datetime.now(tz=UTC),
            )
        )

    for offset in range(7):
        occurred_at = datetime.combine(
            today - timedelta(days=offset),
            datetime.min.time(),
            tzinfo=UTC,
        )
        for index, slug in enumerate(["docs", "launch", "pricing"]):
            for click in range(index + 1):
                ingestion.record_event(
                    ClickEvent(
                        tenant_id=tenant_id,
                        slug=slug,
                        target_url=f"https://example.com/{slug}",
                        occurred_at=occurred_at,
                        visitor_hash=f"visitor-{offset}-{click}",
                        country_code="KR" if index != 2 else "US",
                        country="South Korea" if index != 2 else "United States",
                        city="Seoul" if index != 2 else "New York",
                        device_family="mobile" if click % 2 else "desktop",
                        browser_family="chrome",
                        os_family="ios" if click % 2 else "windows",
                        referrer="google.com" if click % 2 else "direct",
                    )
                )

    date_range = query.resolve_date_range(range_name="7d", today=today)
    summary = query.get_summary(tenant_id=tenant_id, date_range=date_range)
    print(f"Seeded {summary.total_clicks} sample clicks for {tenant_id}.")


if __name__ == "__main__":
    main()
