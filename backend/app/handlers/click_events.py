import json
import logging
from functools import lru_cache
from typing import Any

from app.repositories.interfaces import AnalyticsAggregateRepository, ClickEventRepository
from app.repositories.sqs import click_event_from_message_body
from app.services.analytics import AnalyticsIngestionService

logger = logging.getLogger(__name__)


@lru_cache
def get_click_event_repository() -> ClickEventRepository:
    from app.core.config import get_settings
    from app.repositories.dynamodb import DynamoDBClickEventRepository

    settings = get_settings()
    if not settings.click_events_table_name:
        msg = "SHORTLINK_CLICK_EVENTS_TABLE_NAME is required for click event ingestion."
        raise RuntimeError(msg)
    return DynamoDBClickEventRepository(settings.click_events_table_name)


@lru_cache
def get_analytics_aggregate_repository() -> AnalyticsAggregateRepository:
    from app.core.config import get_settings
    from app.repositories.dynamodb import DynamoDBAnalyticsAggregateRepository

    settings = get_settings()
    if not settings.analytics_aggregates_table_name:
        msg = "SHORTLINK_ANALYTICS_AGGREGATES_TABLE_NAME is required for click analytics ingestion."
        raise RuntimeError(msg)
    return DynamoDBAnalyticsAggregateRepository(settings.analytics_aggregates_table_name)


def process_records(
    records: list[dict[str, Any]],
    service: AnalyticsIngestionService,
) -> int:
    processed = 0
    for record in records:
        body = record.get("body")
        if not isinstance(body, str):
            continue
        try:
            event = click_event_from_message_body(body)
        except (json.JSONDecodeError, KeyError, ValueError):
            logger.warning("malformed_click_event_skipped")
            processed += 1
            continue
        service.record_event(event)
        processed += 1
    return processed


def handler(event: dict[str, Any], context: object) -> dict[str, int]:
    records = event.get("Records", [])
    if not isinstance(records, list):
        return {"processed": 0}
    service = AnalyticsIngestionService(
        get_click_event_repository(),
        get_analytics_aggregate_repository(),
    )
    return {"processed": process_records(records, service)}
