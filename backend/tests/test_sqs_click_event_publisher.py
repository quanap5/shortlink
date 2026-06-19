import json

from app.domain.models import ClickEvent, utc_now
from app.repositories.sqs import SQSClickEventPublisher


class FakeSQSClient:
    def __init__(self) -> None:
        self.messages: list[dict[str, str]] = []

    def send_message(self, **kwargs: str) -> None:
        self.messages.append(kwargs)


def test_sqs_click_event_publisher_sends_tenant_scoped_event() -> None:
    client = FakeSQSClient()
    publisher = SQSClickEventPublisher("https://sqs.example/queue", sqs_client=client)
    event = ClickEvent(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        occurred_at=utc_now(),
        user_agent="pytest",
        ip_address="127.0.0.1",
    )

    published = publisher.publish(event)

    assert published == event
    assert client.messages[0]["QueueUrl"] == "https://sqs.example/queue"
    body = json.loads(client.messages[0]["MessageBody"])
    assert body["tenant_id"] == "tenant-a"
    assert body["slug"] == "docs"
