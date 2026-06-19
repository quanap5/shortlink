from functools import lru_cache

from fastapi import HTTPException, Request, status

from app.api.tenant import MissingTenantClaimError, require_tenant_id_from_event
from app.core.config import get_settings
from app.repositories.interfaces import (
    AnalyticsAggregateRepository,
    ClickEventPublisher,
    ClickEventRepository,
    LinkRepository,
    TenantRepository,
)
from app.repositories.memory import (
    InMemoryAnalyticsAggregateRepository,
    InMemoryClickEventRepository,
    InMemoryLinkRepository,
    InMemoryTenantRepository,
)
from app.services.analytics import AnalyticsQueryService
from app.services.links import ClickEventService, LinkCreationService, RedirectService
from app.services.tenants import TenantRegistrationService


@lru_cache
def get_link_repository() -> LinkRepository:
    settings = get_settings()
    if settings.links_table_name:
        from app.repositories.dynamodb import DynamoDBLinkRepository

        return DynamoDBLinkRepository(settings.links_table_name)
    return InMemoryLinkRepository()


@lru_cache
def get_tenant_repository() -> TenantRepository:
    settings = get_settings()
    if settings.tenants_table_name:
        from app.repositories.dynamodb import DynamoDBTenantRepository

        return DynamoDBTenantRepository(settings.tenants_table_name)
    return InMemoryTenantRepository()


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


@lru_cache
def get_click_event_repository() -> ClickEventRepository:
    settings = get_settings()
    if settings.click_events_table_name:
        from app.repositories.dynamodb import DynamoDBClickEventRepository

        return DynamoDBClickEventRepository(settings.click_events_table_name)
    publisher = get_click_event_publisher()
    if isinstance(publisher, ClickEventRepository):
        return publisher
    return InMemoryClickEventRepository()


@lru_cache
def get_analytics_aggregate_repository() -> AnalyticsAggregateRepository:
    settings = get_settings()
    if settings.analytics_aggregates_table_name:
        from app.repositories.dynamodb import DynamoDBAnalyticsAggregateRepository

        return DynamoDBAnalyticsAggregateRepository(settings.analytics_aggregates_table_name)
    return InMemoryAnalyticsAggregateRepository()


def get_link_creation_service() -> LinkCreationService:
    return LinkCreationService(get_link_repository())


def get_redirect_service() -> RedirectService:
    return RedirectService(get_link_repository())


def get_click_event_service() -> ClickEventService:
    return ClickEventService(get_click_event_publisher())


def get_analytics_query_service() -> AnalyticsQueryService:
    return AnalyticsQueryService(
        get_click_event_repository(),
        get_analytics_aggregate_repository(),
        get_link_repository(),
    )


@lru_cache
def get_cognito_registration():
    settings = get_settings()
    if settings.cognito_registration_client_id and settings.cognito_registration_client_secret:
        from app.repositories.cognito import CognitoRegistrationAdapter

        return CognitoRegistrationAdapter(
            client_id=settings.cognito_registration_client_id,
            client_secret=settings.cognito_registration_client_secret,
        )
    raise RuntimeError("Cognito registration is not configured.")


def get_tenant_registration_service() -> TenantRegistrationService:
    return TenantRegistrationService(get_tenant_repository(), get_cognito_registration())


def get_tenant_id(request: Request) -> str:
    event = request.scope.get("aws.event")
    if isinstance(event, dict):
        try:
            return require_tenant_id_from_event(event)
        except MissingTenantClaimError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing tenant claim.",
            ) from exc
    return "default-tenant"
