from datetime import datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

from app.domain.errors import LinkAlreadyExistsError
from app.domain.models import ClickEvent, Link
from app.repositories.interfaces import ClickEventPublisher, ClickEventRepository, LinkRepository


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
        if not item:
            return None
        return Link(
            tenant_id=item["tenant_id"],
            slug=item["slug"],
            target_url=item["target_url"],
            created_at=datetime.fromisoformat(item["created_at"]),
            created_by=item.get("created_by"),
        )

    def list_by_tenant(self, tenant_id: str) -> list[Link]:
        response = self._table.query(
            KeyConditionExpression="tenant_id = :tenant_id",
            ExpressionAttributeValues={":tenant_id": tenant_id},
        )
        return [
            Link(
                tenant_id=item["tenant_id"],
                slug=item["slug"],
                target_url=item["target_url"],
                created_at=datetime.fromisoformat(item["created_at"]),
                created_by=item.get("created_by"),
            )
            for item in response.get("Items", [])
        ]


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
                "user_agent": event.user_agent,
                "ip_address": event.ip_address,
            }
        )
        return event

    def publish(self, event: ClickEvent) -> ClickEvent:
        return self.record(event)
