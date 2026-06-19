import json
from datetime import datetime
from typing import Any

from app.domain.models import ClickEvent
from app.repositories.interfaces import ClickEventPublisher


class SQSClickEventPublisher(ClickEventPublisher):
    def __init__(self, queue_url: str, sqs_client: Any | None = None) -> None:
        self._queue_url = queue_url
        if sqs_client is None:
            import boto3

            sqs_client = boto3.client("sqs")
        self._client = sqs_client

    def publish(self, event: ClickEvent) -> ClickEvent:
        self._client.send_message(
            QueueUrl=self._queue_url,
            MessageBody=json.dumps(
                {
                    "tenant_id": event.tenant_id,
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
                    "latitude": event.latitude,
                    "longitude": event.longitude,
                    "referrer": event.referrer,
                    "device_family": event.device_family,
                    "browser_family": event.browser_family,
                    "os_family": event.os_family,
                }
            ),
        )
        return event


def click_event_from_message_body(body: str) -> ClickEvent:
    payload = json.loads(body)
    return ClickEvent(
        tenant_id=payload["tenant_id"],
        slug=payload["slug"],
        target_url=payload["target_url"],
        occurred_at=datetime.fromisoformat(payload["occurred_at"]),
        visitor_hash=payload.get("visitor_hash"),
        ip_hash=payload.get("ip_hash"),
        user_agent_hash=payload.get("user_agent_hash"),
        country_code=payload.get("country_code"),
        country=payload.get("country"),
        region=payload.get("region"),
        city=payload.get("city"),
        latitude=payload.get("latitude"),
        longitude=payload.get("longitude"),
        referrer=payload.get("referrer", "direct"),
        device_family=payload.get("device_family", "unknown"),
        browser_family=payload.get("browser_family", "unknown"),
        os_family=payload.get("os_family", "unknown"),
    )
