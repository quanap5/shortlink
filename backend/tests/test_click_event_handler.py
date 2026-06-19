from app.handlers.click_events import process_records
from app.repositories.memory import InMemoryClickEventRepository
from app.services.analytics import AnalyticsIngestionService


def test_process_records_stores_sqs_click_event() -> None:
    repository = InMemoryClickEventRepository()
    service = AnalyticsIngestionService(repository)
    records = [
        {
            "messageId": "1",
            "body": (
                '{"tenant_id":"tenant-a","slug":"docs",'
                '"target_url":"https://example.com/docs",'
                '"occurred_at":"2026-06-20T00:00:00+00:00",'
                '"visitor_hash":"visitor-hash","ip_hash":"ip-hash",'
                '"user_agent_hash":"ua-hash","country_code":"KR",'
                '"device_family":"desktop","browser_family":"chrome","os_family":"windows"}'
            ),
        }
    ]

    result = process_records(records, service)

    assert result == 1
    assert len(repository.events) == 1
    assert repository.events[0].tenant_id == "tenant-a"
    assert repository.events[0].country_code == "KR"


def test_process_records_skips_malformed_message() -> None:
    repository = InMemoryClickEventRepository()
    service = AnalyticsIngestionService(repository)

    result = process_records([{"messageId": "1", "body": "{bad-json"}], service)

    assert result == 1
    assert repository.events == []
