from functools import lru_cache

from fastapi import Request

from app.api.tenant import get_tenant_id_from_event
from app.core.config import get_settings
from app.repositories.interfaces import ClickEventPublisher, LinkRepository
from app.repositories.memory import InMemoryClickEventRepository, InMemoryLinkRepository
from app.services.links import ClickEventService, LinkCreationService, RedirectService


@lru_cache
def get_link_repository() -> LinkRepository:
    settings = get_settings()
    if settings.links_table_name:
        from app.repositories.dynamodb import DynamoDBLinkRepository

        return DynamoDBLinkRepository(settings.links_table_name)
    return InMemoryLinkRepository()


@lru_cache
def get_click_event_publisher() -> ClickEventPublisher:
    settings = get_settings()
    if settings.click_events_queue_url:
        from app.repositories.sqs import SQSClickEventPublisher

        return SQSClickEventPublisher(settings.click_events_queue_url)
    if settings.click_events_table_name:
        from app.repositories.dynamodb import DynamoDBClickEventRepository

        return DynamoDBClickEventRepository(settings.click_events_table_name)
    return InMemoryClickEventRepository()


def get_link_creation_service() -> LinkCreationService:
    return LinkCreationService(get_link_repository())


def get_redirect_service() -> RedirectService:
    return RedirectService(get_link_repository())


def get_click_event_service() -> ClickEventService:
    return ClickEventService(get_click_event_publisher())


def get_tenant_id(request: Request) -> str:
    event = request.scope.get("aws.event")
    if isinstance(event, dict):
        return get_tenant_id_from_event(event)
    return "default-tenant"
