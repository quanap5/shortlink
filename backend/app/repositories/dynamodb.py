from collections import Counter
from datetime import datetime
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from app.domain.errors import LinkAlreadyExistsError, TenantAlreadyExistsError
from app.domain.models import (
    AnalyticsAggregate,
    ClickEvent,
    Link,
    LinkAnalyticsListItem,
    LinkAnalyticsSummary,
    Tenant,
)
from app.repositories.interfaces import (
    AnalyticsAggregateRepository,
    ClickEventPublisher,
    ClickEventRepository,
    LinkRepository,
    TenantRepository,
)


class DynamoDBLinkRepository(LinkRepository):
    def __init__(self, table_name: str, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(table_name)

    def create(self, link: Link) -> Link:
        item = {
            "tenant_id": link.tenant_id,
            "slug": link.slug,
            "target_url": link.target_url,
            "created_at": link.created_at.isoformat(),
            "created_by": link.created_by,
            "expire_at": link.expire_at.isoformat() if link.expire_at else None,
            "status": link.status,
            "redirect_type": link.redirect_type,
            "tags": link.tags or [],
        }
        try:
            condition = "attribute_not_exists(tenant_id) AND attribute_not_exists(slug)"
            self._table.put_item(
                Item=item,
                ConditionExpression=condition,
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise LinkAlreadyExistsError(link.slug) from exc
            raise
        return link

    def get(self, tenant_id: str, slug: str) -> Link | None:
        response = self._table.get_item(Key={"tenant_id": tenant_id, "slug": slug})
        item = response.get("Item")
        return _link_from_item(item) if item else None

    def get_by_slug(self, slug: str) -> Link | None:
        response = self._table.query(
            IndexName="slug_index",
            KeyConditionExpression=Key("slug").eq(slug),
            Limit=1,
        )
        items = response.get("Items", [])
        return _link_from_item(items[0]) if items else None

    def list_by_tenant(self, tenant_id: str) -> list[Link]:
        response = self._table.query(
            KeyConditionExpression="tenant_id = :tenant_id",
            ExpressionAttributeValues={":tenant_id": tenant_id},
        )
        return [
            _link_from_item(item)
            for item in response.get("Items", [])
        ]


class DynamoDBTenantRepository(TenantRepository):
    def __init__(self, table_name: str, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(table_name)

    def create(self, tenant: Tenant) -> Tenant:
        try:
            self._table.put_item(
                Item={
                    "tenant_id": tenant.tenant_id,
                    "name": tenant.name,
                    "owner_email": tenant.owner_email,
                    "status": tenant.status,
                    "created_at": tenant.created_at.isoformat(),
                },
                ConditionExpression="attribute_not_exists(tenant_id)",
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise TenantAlreadyExistsError(tenant.tenant_id) from exc
            raise
        return tenant

    def get(self, tenant_id: str) -> Tenant | None:
        response = self._table.get_item(Key={"tenant_id": tenant_id})
        item = response.get("Item")
        return _tenant_from_item(item) if item else None

    def delete(self, tenant_id: str) -> None:
        self._table.delete_item(Key={"tenant_id": tenant_id})


class DynamoDBClickEventRepository(ClickEventPublisher, ClickEventRepository):
    def __init__(self, table_name: str, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(table_name)

    def record(self, event: ClickEvent) -> ClickEvent:
        self._table.put_item(
            Item={
                "tenant_id": event.tenant_id,
                "slug_occurred_at": f"{event.slug}#{event.occurred_at.isoformat()}",
                "slug": event.slug,
                "target_url": event.target_url,
                "occurred_at": event.occurred_at.isoformat(),
                "visitor_hash": event.visitor_hash,
                "ip_hash": event.ip_hash,
                "user_agent_hash": event.user_agent_hash,
                "country_code": event.country_code,
                "country": event.country,
                "region": event.region,
                "city": event.city,
                "latitude": _decimal_or_none(event.latitude),
                "longitude": _decimal_or_none(event.longitude),
                "referrer": event.referrer,
                "device_family": event.device_family,
                "browser_family": event.browser_family,
                "os_family": event.os_family,
            }
        )
        return event

    def publish(self, event: ClickEvent) -> ClickEvent:
        return self.record(event)

    def list_by_link(self, tenant_id: str, slug: str, limit: int = 50) -> list[ClickEvent]:
        response = self._table.query(
            KeyConditionExpression=Key("tenant_id").eq(tenant_id)
            & Key("slug_occurred_at").begins_with(f"{slug}#"),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_click_event_from_item(item) for item in response.get("Items", [])]

    def list_by_tenant(self, tenant_id: str, limit: int = 500) -> list[ClickEvent]:
        response = self._table.query(
            KeyConditionExpression=Key("tenant_id").eq(tenant_id),
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_click_event_from_item(item) for item in response.get("Items", [])]

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
        summaries: list[LinkAnalyticsListItem] = []
        for slug in slugs:
            link_events = [event for event in events if event.slug == slug]
            summaries.append(
                LinkAnalyticsListItem(
                    slug=slug,
                    total_hits=len(link_events),
                    by_country=_count_values(
                        event.country_code or "unknown" for event in link_events
                    ),
                    by_device=_count_values(event.device_family for event in link_events),
                    by_browser=_count_values(event.browser_family for event in link_events),
                )
            )
        return sorted(summaries, key=lambda item: item.total_hits, reverse=True)


def _link_from_item(item: dict[str, Any]) -> Link:
    return Link(
        tenant_id=item["tenant_id"],
        slug=item["slug"],
        target_url=item["target_url"],
        created_at=datetime.fromisoformat(item["created_at"]),
        created_by=item.get("created_by"),
        expire_at=_datetime_or_none(item.get("expire_at")),
        status=item.get("status", "active"),
        redirect_type=int(item.get("redirect_type", 302)),
        tags=[str(tag) for tag in item.get("tags", [])],
    )


def _click_event_from_item(item: dict[str, Any]) -> ClickEvent:
    return ClickEvent(
        tenant_id=item["tenant_id"],
        slug=item["slug"],
        target_url=item["target_url"],
        occurred_at=datetime.fromisoformat(item["occurred_at"]),
        visitor_hash=item.get("visitor_hash"),
        ip_hash=item.get("ip_hash"),
        user_agent_hash=item.get("user_agent_hash"),
        country_code=item.get("country_code"),
        country=item.get("country"),
        region=item.get("region"),
        city=item.get("city"),
        latitude=_float_or_none(item.get("latitude")),
        longitude=_float_or_none(item.get("longitude")),
        referrer=item.get("referrer", "direct"),
        device_family=item.get("device_family", "unknown"),
        browser_family=item.get("browser_family", "unknown"),
        os_family=item.get("os_family", "unknown"),
    )


def _count_values(values: Any) -> dict[str, int]:
    return dict(Counter(values))


class DynamoDBAnalyticsAggregateRepository(AnalyticsAggregateRepository):
    def __init__(self, table_name: str, dynamodb_resource: Any | None = None) -> None:
        resource = dynamodb_resource or boto3.resource("dynamodb")
        self._table = resource.Table(table_name)

    def increment(
        self,
        *,
        tenant_id: str,
        metric_key: str,
        amount: int = 1,
        labels: dict[str, str] | None = None,
    ) -> AnalyticsAggregate:
        update_expression = "SET labels = :labels ADD clicks :amount"
        response = self._table.update_item(
            Key={"tenant_id": tenant_id, "metric_key": metric_key},
            UpdateExpression=update_expression,
            ExpressionAttributeValues={
                ":amount": amount,
                ":labels": labels or {},
            },
            ReturnValues="ALL_NEW",
        )
        return _aggregate_from_item(response["Attributes"])

    def query_by_prefix(self, *, tenant_id: str, prefix: str) -> list[AnalyticsAggregate]:
        response = self._table.query(
            KeyConditionExpression=Key("tenant_id").eq(tenant_id)
            & Key("metric_key").begins_with(prefix),
        )
        return [_aggregate_from_item(item) for item in response.get("Items", [])]


def _aggregate_from_item(item: dict[str, Any]) -> AnalyticsAggregate:
    return AnalyticsAggregate(
        tenant_id=item["tenant_id"],
        metric_key=item["metric_key"],
        clicks=int(item.get("clicks", 0)),
        labels={str(key): str(value) for key, value in item.get("labels", {}).items()},
    )


def _tenant_from_item(item: dict[str, Any]) -> Tenant:
    return Tenant(
        tenant_id=str(item["tenant_id"]),
        name=str(item["name"]),
        owner_email=str(item["owner_email"]),
        status=str(item["status"]),  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(str(item["created_at"])),
    )


def _float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _decimal_or_none(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _datetime_or_none(value: Any) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(str(value))
