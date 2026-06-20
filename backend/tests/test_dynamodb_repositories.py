from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from app.domain.models import ClickEvent, Link
from app.repositories.dynamodb import DynamoDBClickEventRepository, DynamoDBLinkRepository


class FakeTable:
    def __init__(self) -> None:
        self.item: dict[str, Any] | None = None

    def put_item(
        self,
        *,
        Item: dict[str, Any],  # noqa: N803
        ConditionExpression: str | None = None,  # noqa: N803
    ) -> None:
        self.item = Item

    def get_item(self, *, Key: dict[str, str]) -> dict[str, Any]:  # noqa: N803, ARG002
        return {"Item": self.item} if self.item else {}


class FakeDynamoDBResource:
    def __init__(self) -> None:
        self.table = FakeTable()

    def Table(self, table_name: str) -> FakeTable:  # noqa: N802, ARG002
        return self.table


def test_click_event_repository_converts_geo_floats_for_dynamodb() -> None:
    resource = FakeDynamoDBResource()
    repository = DynamoDBClickEventRepository("click-events", dynamodb_resource=resource)

    repository.record(
        ClickEvent(
            tenant_id="tenant-a",
            slug="docs",
            target_url="https://example.com/docs",
            occurred_at=datetime(2026, 6, 20, tzinfo=UTC),
            visitor_hash="visitor-hash",
            ip_hash="ip-hash",
            user_agent_hash="ua-hash",
            country_code="KR",
            country="South Korea",
            region="Seoul",
            city="Seoul",
            latitude=37.5665,
            longitude=126.978,
            referrer="direct",
            device_family="desktop",
            browser_family="chrome",
            os_family="windows",
        )
    )

    assert resource.table.item is not None
    assert resource.table.item["latitude"] == Decimal("37.5665")
    assert resource.table.item["longitude"] == Decimal("126.978")


def test_link_repository_persists_tags() -> None:
    resource = FakeDynamoDBResource()
    repository = DynamoDBLinkRepository("links", dynamodb_resource=resource)
    link = Link(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        created_at=datetime(2026, 6, 20, tzinfo=UTC),
        tags=["docs", "launch"],
    )

    repository.create(link)
    stored = repository.get("tenant-a", "docs")

    assert resource.table.item is not None
    assert resource.table.item["tags"] == ["docs", "launch"]
    assert stored is not None
    assert stored.tags == ["docs", "launch"]
