from collections import Counter
from collections.abc import Iterable

from app.domain.models import (
    AnalyticsAggregate,
    ClickEvent,
    Link,
    LinkAnalyticsListItem,
    LinkAnalyticsSummary,
)
from app.repositories.interfaces import (
    AnalyticsAggregateRepository,
    ClickEventPublisher,
    ClickEventRepository,
    LinkRepository,
)


class InMemoryLinkRepository(LinkRepository):
    def __init__(self) -> None:
        self._links: dict[tuple[str, str], Link] = {}

    def create(self, link: Link) -> Link:
        self._links[(link.tenant_id, link.slug)] = link
        return link

    def get(self, tenant_id: str, slug: str) -> Link | None:
        return self._links.get((tenant_id, slug))

    def list_by_tenant(self, tenant_id: str) -> list[Link]:
        return [link for link in self._links.values() if link.tenant_id == tenant_id]


class InMemoryClickEventRepository(ClickEventPublisher, ClickEventRepository):
    def __init__(self) -> None:
        self.events: list[ClickEvent] = []

    def record(self, event: ClickEvent) -> ClickEvent:
        self.events.append(event)
        return event

    def publish(self, event: ClickEvent) -> ClickEvent:
        return self.record(event)

    def list_by_link(self, tenant_id: str, slug: str, limit: int = 50) -> list[ClickEvent]:
        events = [
            event
            for event in self.events
            if event.tenant_id == tenant_id and event.slug == slug
        ]
        return sorted(events, key=lambda event: event.occurred_at, reverse=True)[:limit]

    def list_by_tenant(self, tenant_id: str, limit: int = 500) -> list[ClickEvent]:
        events = [event for event in self.events if event.tenant_id == tenant_id]
        return sorted(events, key=lambda event: event.occurred_at, reverse=True)[:limit]

    def get_link_summary(self, tenant_id: str, slug: str) -> LinkAnalyticsSummary:
        events = self.list_by_link(tenant_id, slug, limit=500)
        return LinkAnalyticsSummary(
            tenant_id=tenant_id,
            slug=slug,
            total_hits=len(events),
            by_country=_count_values(event.country_code or "unknown" for event in events),
            by_device=_count_values(event.device_family for event in events),
            by_browser=_count_values(event.browser_family for event in events),
            recent_events=events[:20],
        )

    def list_link_summaries(self, tenant_id: str) -> list[LinkAnalyticsListItem]:
        events = self.list_by_tenant(tenant_id, limit=1000)
        slugs = sorted({event.slug for event in events})
        summaries = []
        for slug in slugs:
            summary = self.get_link_summary(tenant_id, slug)
            summaries.append(
                LinkAnalyticsListItem(
                    slug=slug,
                    total_hits=summary.total_hits,
                    by_country=summary.by_country,
                    by_device=summary.by_device,
                    by_browser=summary.by_browser,
                )
            )
        return sorted(summaries, key=lambda item: item.total_hits, reverse=True)


class InMemoryAnalyticsAggregateRepository(AnalyticsAggregateRepository):
    def __init__(self) -> None:
        self._aggregates: dict[tuple[str, str], AnalyticsAggregate] = {}

    def increment(
        self,
        *,
        tenant_id: str,
        metric_key: str,
        amount: int = 1,
        labels: dict[str, str] | None = None,
    ) -> AnalyticsAggregate:
        key = (tenant_id, metric_key)
        current = self._aggregates.get(key)
        aggregate = AnalyticsAggregate(
            tenant_id=tenant_id,
            metric_key=metric_key,
            clicks=(current.clicks if current else 0) + amount,
            labels={**(current.labels if current else {}), **(labels or {})},
        )
        self._aggregates[key] = aggregate
        return aggregate

    def query_by_prefix(self, *, tenant_id: str, prefix: str) -> list[AnalyticsAggregate]:
        return sorted(
            [
                aggregate
                for aggregate in self._aggregates.values()
                if aggregate.tenant_id == tenant_id and aggregate.metric_key.startswith(prefix)
            ],
            key=lambda aggregate: aggregate.metric_key,
        )


def _count_values(values: Iterable[str]) -> dict[str, int]:
    return dict(Counter(values))
