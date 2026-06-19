from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from app.domain.models import (
    AnalyticsBreakdownItem,
    AnalyticsPoint,
    AnalyticsSummary,
    ClickEvent,
    LinkAnalyticsListItem,
    LinkAnalyticsSummary,
)
from app.repositories.interfaces import (
    AnalyticsAggregateRepository,
    ClickEventRepository,
    LinkRepository,
)


@dataclass(frozen=True)
class AnalyticsDateRange:
    start_date: date
    end_date: date

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def contains(self, value: date) -> bool:
        return self.start_date <= value <= self.end_date


class AnalyticsIngestionService:
    def __init__(
        self,
        click_events: ClickEventRepository,
        aggregates: AnalyticsAggregateRepository | None = None,
    ) -> None:
        self._click_events = click_events
        self._aggregates = aggregates

    def record_event(self, event: ClickEvent) -> ClickEvent:
        recorded = self._click_events.record(event)
        if self._aggregates:
            self._increment_aggregates(recorded)
        return recorded

    def _increment_aggregates(self, event: ClickEvent) -> None:
        event_date = event.occurred_at.astimezone(UTC).date().isoformat()
        tenant_id = event.tenant_id
        country_code = event.country_code or "unknown"
        city = event.city or "unknown"
        dimensions = [
            ("summary", "all", {}),
            ("link", event.slug, {"slug": event.slug, "target_url": event.target_url}),
            (
                "country",
                country_code,
                {"country_code": country_code, "country": event.country or country_code},
            ),
            (
                "city",
                f"{country_code}:{city}",
                {
                    "country_code": country_code,
                    "city": city,
                    "latitude": _string_or_empty(event.latitude),
                    "longitude": _string_or_empty(event.longitude),
                },
            ),
            ("device", event.device_family, {"device": event.device_family}),
            ("browser", event.browser_family, {"browser": event.browser_family}),
            ("os", event.os_family, {"os": event.os_family}),
            ("referrer", event.referrer, {"referrer": event.referrer}),
        ]
        if event.visitor_hash:
            dimensions.append(
                ("visitor", event.visitor_hash, {"visitor_hash": event.visitor_hash})
            )

        for metric, key, labels in dimensions:
            self._aggregates.increment(
                tenant_id=tenant_id,
                metric_key=f"{metric}#{key}#{event_date}",
                labels=labels,
            )


class AnalyticsQueryService:
    def __init__(
        self,
        click_events: ClickEventRepository,
        aggregates: AnalyticsAggregateRepository | None = None,
        links: LinkRepository | None = None,
    ) -> None:
        self._click_events = click_events
        self._aggregates = aggregates
        self._links = links

    def resolve_date_range(
        self,
        *,
        range_name: str = "7d",
        start_date: date | None = None,
        end_date: date | None = None,
        today: date | None = None,
    ) -> AnalyticsDateRange:
        today = today or datetime.now(tz=UTC).date()
        if range_name == "custom":
            if start_date is None or end_date is None:
                raise ValueError("Custom range requires start_date and end_date.")
            if start_date > end_date:
                raise ValueError("start_date must be before or equal to end_date.")
            return AnalyticsDateRange(start_date=start_date, end_date=end_date)

        days_by_range = {"7d": 7, "30d": 30, "90d": 90}
        days = days_by_range.get(range_name)
        if days is None:
            raise ValueError("Unsupported analytics range.")
        return AnalyticsDateRange(start_date=today - timedelta(days=days - 1), end_date=today)

    def get_summary(self, *, tenant_id: str, date_range: AnalyticsDateRange) -> AnalyticsSummary:
        total_clicks = sum(self._counts_by_day(tenant_id, "summary#all", date_range).values())
        top_links = self.get_top_links(tenant_id=tenant_id, date_range=date_range, limit=1)
        unique_visitors = len(
            {
                _key_part(aggregate.metric_key, 1)
                for aggregate in self._aggregates_for(tenant_id, "visitor#")
                if _date_in_range(aggregate.metric_key, date_range)
            }
        )
        total_links = len(self._links.list_by_tenant(tenant_id)) if self._links else 0
        active_links = len(
            {
                item.key
                for item in self.get_top_links(
                    tenant_id=tenant_id,
                    date_range=date_range,
                    limit=1000,
                )
                if item.clicks > 0
            }
        )
        previous_range = AnalyticsDateRange(
            start_date=date_range.start_date - timedelta(days=date_range.days),
            end_date=date_range.start_date - timedelta(days=1),
        )
        previous_clicks = sum(
            self._counts_by_day(tenant_id, "summary#all", previous_range).values()
        )
        growth = _growth_percent(current=total_clicks, previous=previous_clicks)
        return AnalyticsSummary(
            total_clicks=total_clicks,
            unique_visitors=unique_visitors,
            total_links=total_links,
            active_links=active_links,
            top_link=top_links[0].key if top_links else None,
            top_link_clicks=top_links[0].clicks if top_links else 0,
            click_growth_percent=growth,
        )

    def get_timeseries(
        self,
        *,
        tenant_id: str,
        date_range: AnalyticsDateRange,
    ) -> list[AnalyticsPoint]:
        counts = self._counts_by_day(tenant_id, "summary#all", date_range)
        points: list[AnalyticsPoint] = []
        for offset in range(date_range.days):
            day = date_range.start_date + timedelta(days=offset)
            label = day.isoformat()
            points.append(AnalyticsPoint(label=label, clicks=counts.get(label, 0)))
        return points

    def get_breakdown(
        self,
        *,
        tenant_id: str,
        dimension: str,
        date_range: AnalyticsDateRange,
        limit: int = 10,
    ) -> list[AnalyticsBreakdownItem]:
        allowed = {"country", "city", "device", "browser", "os", "referrer"}
        if dimension not in allowed:
            raise ValueError("Unsupported analytics dimension.")
        return self._dimension_items(tenant_id, dimension, date_range, limit)

    def get_top_links(
        self,
        *,
        tenant_id: str,
        date_range: AnalyticsDateRange,
        limit: int = 10,
    ) -> list[AnalyticsBreakdownItem]:
        return self._dimension_items(tenant_id, "link", date_range, limit)

    def get_link_analytics(self, *, tenant_id: str, slug: str) -> LinkAnalyticsSummary:
        return self._click_events.get_link_summary(tenant_id, slug)

    def list_link_summaries(self, *, tenant_id: str) -> list[LinkAnalyticsListItem]:
        return self._click_events.list_link_summaries(tenant_id)

    def _dimension_items(
        self,
        tenant_id: str,
        dimension: str,
        date_range: AnalyticsDateRange,
        limit: int,
    ) -> list[AnalyticsBreakdownItem]:
        totals: dict[str, int] = {}
        metadata: dict[str, dict[str, str]] = {}
        for aggregate in self._aggregates_for(tenant_id, f"{dimension}#"):
            if not _date_in_range(aggregate.metric_key, date_range):
                continue
            key = _key_part(aggregate.metric_key, 1)
            totals[key] = totals.get(key, 0) + aggregate.clicks
            metadata[key] = {**metadata.get(key, {}), **aggregate.labels}

        items = [
            AnalyticsBreakdownItem(
                key=key,
                label=_label_for(key, metadata.get(key, {}), dimension),
                clicks=clicks,
                metadata=metadata.get(key, {}),
            )
            for key, clicks in totals.items()
        ]
        return sorted(items, key=lambda item: item.clicks, reverse=True)[:limit]

    def _counts_by_day(
        self,
        tenant_id: str,
        prefix: str,
        date_range: AnalyticsDateRange,
    ) -> dict[str, int]:
        counts: dict[str, int] = {}
        for aggregate in self._aggregates_for(tenant_id, f"{prefix}#"):
            aggregate_date = _date_from_metric_key(aggregate.metric_key)
            if aggregate_date and date_range.contains(aggregate_date):
                label = aggregate_date.isoformat()
                counts[label] = counts.get(label, 0) + aggregate.clicks
        return counts

    def _aggregates_for(self, tenant_id: str, prefix: str):
        if not self._aggregates:
            return []
        return self._aggregates.query_by_prefix(tenant_id=tenant_id, prefix=prefix)


def _date_from_metric_key(metric_key: str) -> date | None:
    try:
        return date.fromisoformat(metric_key.rsplit("#", 1)[1])
    except (IndexError, ValueError):
        return None


def _date_in_range(metric_key: str, date_range: AnalyticsDateRange) -> bool:
    metric_date = _date_from_metric_key(metric_key)
    return bool(metric_date and date_range.contains(metric_date))


def _key_part(metric_key: str, index: int) -> str:
    return metric_key.split("#")[index]


def _label_for(key: str, metadata: dict[str, str], dimension: str) -> str:
    if dimension == "country":
        return metadata.get("country") or key
    if dimension == "city":
        return metadata.get("city") or key
    if dimension == "link":
        return key
    return metadata.get(dimension) or key


def _growth_percent(*, current: int, previous: int) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100, 2)


def _string_or_empty(value: float | None) -> str:
    return "" if value is None else str(value)
