import json
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
                    "user_agent": event.user_agent,
                    "ip_address": event.ip_address,
                }
            ),
        )
        return event
