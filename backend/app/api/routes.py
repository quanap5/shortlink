import secrets
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse

from app.api.dependencies import (
    get_analytics_query_service,
    get_click_event_service,
    get_link_creation_service,
    get_link_repository,
    get_redirect_service,
    get_tenant_id,
    get_tenant_registration_service,
)
from app.domain.errors import (
    LinkAlreadyExistsError,
    LinkInactiveError,
    LinkNotFoundError,
    TenantAlreadyExistsError,
    TenantRegistrationError,
)
from app.domain.models import AnalyticsBreakdownItem
from app.repositories.interfaces import LinkRepository
from app.schemas.analytics import (
    AnalyticsBreakdownItemResponse,
    AnalyticsBreakdownResponse,
    AnalyticsLinksResponse,
    AnalyticsLinkSummaryResponse,
    AnalyticsPointResponse,
    AnalyticsSummaryResponse,
    AnalyticsTimeseriesResponse,
    ClickEventResponse,
    LinkAnalyticsResponse,
)
from app.schemas.links import CreateLinkRequest, LinkResponse, LinksResponse
from app.schemas.tenants import RegisterTenantRequest, RegisterTenantResponse
from app.services.analytics import AnalyticsQueryService
from app.services.links import ClickEventService, LinkCreationService, RedirectService
from app.services.tenants import TenantRegistrationService

router = APIRouter()

TenantId = Annotated[str, Depends(get_tenant_id)]
LinkCreationDependency = Annotated[LinkCreationService, Depends(get_link_creation_service)]
LinkRepositoryDependency = Annotated[LinkRepository, Depends(get_link_repository)]
RedirectDependency = Annotated[RedirectService, Depends(get_redirect_service)]
ClickEventDependency = Annotated[ClickEventService, Depends(get_click_event_service)]
AnalyticsQueryDependency = Annotated[AnalyticsQueryService, Depends(get_analytics_query_service)]
TenantRegistrationDependency = Annotated[
    TenantRegistrationService,
    Depends(get_tenant_registration_service),
]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post(
    "/tenants/register",
    response_model=RegisterTenantResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_tenant(
    payload: RegisterTenantRequest,
    service: TenantRegistrationDependency,
) -> RegisterTenantResponse:
    try:
        tenant = service.register_tenant(
            tenant_name=payload.tenant_name,
            owner_email=payload.owner_email,
            password=payload.password,
        )
    except TenantAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant already exists.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except TenantRegistrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to complete registration.",
        ) from exc
    return RegisterTenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        owner_email=tenant.owner_email,
        status=tenant.status,
    )


@router.post("/links", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
def create_link(
    payload: CreateLinkRequest,
    tenant_id: TenantId,
    service: LinkCreationDependency,
) -> LinkResponse:
    try:
        link = service.create_link(
            tenant_id=tenant_id,
            slug=payload.slug,
            target_url=payload.target_url,
            expire_at=payload.expire_at,
            expire_after_days=payload.expire_after_days,
            status=payload.status,
            redirect_type=payload.redirect_type,
        )
    except LinkAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Slug already exists",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return LinkResponse.model_validate(link)


@router.get("/links", response_model=LinksResponse)
def list_links(
    tenant_id: TenantId,
    repository: LinkRepositoryDependency,
) -> LinksResponse:
    links = [LinkResponse.model_validate(link) for link in repository.list_by_tenant(tenant_id)]
    return LinksResponse(links=links)


@router.get("/analytics/links", response_model=AnalyticsLinksResponse)
def list_link_analytics(
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
) -> AnalyticsLinksResponse:
    summaries = service.list_link_summaries(tenant_id=tenant_id)
    return AnalyticsLinksResponse(
        links=[
            AnalyticsLinkSummaryResponse(
                slug=summary.slug,
                total_hits=summary.total_hits,
                by_country=summary.by_country,
                by_device=summary.by_device,
                by_browser=summary.by_browser,
            )
            for summary in summaries
        ]
    )


@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
    range_name: Annotated[str, Query(alias="range")] = "7d",
    start_date: date | None = None,
    end_date: date | None = None,
) -> AnalyticsSummaryResponse:
    try:
        date_range = service.resolve_date_range(
            range_name=range_name,
            start_date=start_date,
            end_date=end_date,
        )
        summary = service.get_summary(tenant_id=tenant_id, date_range=date_range)
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return AnalyticsSummaryResponse(**summary.__dict__)


@router.get("/analytics/timeseries", response_model=AnalyticsTimeseriesResponse)
def get_analytics_timeseries(
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
    range_name: Annotated[str, Query(alias="range")] = "7d",
    start_date: date | None = None,
    end_date: date | None = None,
) -> AnalyticsTimeseriesResponse:
    try:
        date_range = service.resolve_date_range(
            range_name=range_name,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return AnalyticsTimeseriesResponse(
        points=[
            AnalyticsPointResponse(label=point.label, clicks=point.clicks)
            for point in service.get_timeseries(tenant_id=tenant_id, date_range=date_range)
        ]
    )


@router.get("/analytics/breakdowns/{dimension}", response_model=AnalyticsBreakdownResponse)
def get_analytics_breakdown(
    dimension: str,
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
    range_name: Annotated[str, Query(alias="range")] = "7d",
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 10,
) -> AnalyticsBreakdownResponse:
    try:
        date_range = service.resolve_date_range(
            range_name=range_name,
            start_date=start_date,
            end_date=end_date,
        )
        items = service.get_breakdown(
            tenant_id=tenant_id,
            dimension=dimension,
            date_range=date_range,
            limit=limit,
        )
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return _breakdown_response(items)


@router.get("/analytics/top-links", response_model=AnalyticsBreakdownResponse)
def get_analytics_top_links(
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
    range_name: Annotated[str, Query(alias="range")] = "7d",
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 10,
) -> AnalyticsBreakdownResponse:
    try:
        date_range = service.resolve_date_range(
            range_name=range_name,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return _breakdown_response(
        service.get_top_links(tenant_id=tenant_id, date_range=date_range, limit=limit)
    )


@router.get("/analytics/map", response_model=AnalyticsBreakdownResponse)
def get_analytics_map(
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
    range_name: Annotated[str, Query(alias="range")] = "7d",
    start_date: date | None = None,
    end_date: date | None = None,
) -> AnalyticsBreakdownResponse:
    try:
        date_range = service.resolve_date_range(
            range_name=range_name,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise _unprocessable(str(exc)) from exc
    return _breakdown_response(
        service.get_breakdown(
            tenant_id=tenant_id,
            dimension="city",
            date_range=date_range,
            limit=50,
        )
    )


@router.get("/links/{slug}/analytics", response_model=LinkAnalyticsResponse)
def get_link_analytics(
    slug: str,
    tenant_id: TenantId,
    service: AnalyticsQueryDependency,
) -> LinkAnalyticsResponse:
    summary = service.get_link_analytics(tenant_id=tenant_id, slug=slug)
    return LinkAnalyticsResponse(
        slug=summary.slug,
        total_hits=summary.total_hits,
        by_country=summary.by_country,
        by_device=summary.by_device,
        by_browser=summary.by_browser,
        recent_events=[ClickEventResponse.model_validate(event) for event in summary.recent_events],
    )


@router.get("/{slug}")
def redirect_link(
    slug: str,
    request: Request,
    tenant_id: TenantId,
    redirect_service: RedirectDependency,
    click_service: ClickEventDependency,
) -> RedirectResponse:
    try:
        link = redirect_service.resolve(tenant_id=tenant_id, slug=slug)
    except (LinkNotFoundError, LinkInactiveError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found") from exc

    visitor_id = request.cookies.get("shortlink_vid") or _new_visitor_id()
    click_service.record_click(
        tenant_id=tenant_id,
        slug=slug,
        target_url=link.target_url,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
        country_code=request.headers.get("cloudfront-viewer-country")
        or request.headers.get("x-vercel-ip-country"),
        country=request.headers.get("cloudfront-viewer-country-name"),
        region=request.headers.get("cloudfront-viewer-country-region-name"),
        city=request.headers.get("cloudfront-viewer-city"),
        latitude=_float_header(request, "cloudfront-viewer-latitude"),
        longitude=_float_header(request, "cloudfront-viewer-longitude"),
        referrer=request.headers.get("referer"),
        visitor_id=visitor_id,
    )
    response = RedirectResponse(url=link.target_url, status_code=link.redirect_type)
    if "shortlink_vid" not in request.cookies:
        response.set_cookie(
            "shortlink_vid",
            visitor_id,
            httponly=True,
            max_age=60 * 60 * 24 * 365,
            samesite="lax",
            secure=True,
        )
    return response


def _breakdown_response(items: list[AnalyticsBreakdownItem]) -> AnalyticsBreakdownResponse:
    return AnalyticsBreakdownResponse(
        items=[
            AnalyticsBreakdownItemResponse(
                key=item.key,
                label=item.label,
                clicks=item.clicks,
                metadata=item.metadata,
            )
            for item in items
        ]
    )


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _float_header(request: Request, header_name: str) -> float | None:
    value = request.headers.get(header_name)
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _new_visitor_id() -> str:
    return secrets.token_urlsafe(24)


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
