from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.api.dependencies import (
    get_click_event_service,
    get_link_creation_service,
    get_link_repository,
    get_redirect_service,
    get_tenant_id,
)
from app.domain.errors import LinkAlreadyExistsError, LinkNotFoundError
from app.repositories.interfaces import LinkRepository
from app.schemas.links import CreateLinkRequest, LinkResponse, LinksResponse
from app.services.links import ClickEventService, LinkCreationService, RedirectService

router = APIRouter()

TenantId = Annotated[str, Depends(get_tenant_id)]
LinkCreationDependency = Annotated[LinkCreationService, Depends(get_link_creation_service)]
LinkRepositoryDependency = Annotated[LinkRepository, Depends(get_link_repository)]
RedirectDependency = Annotated[RedirectService, Depends(get_redirect_service)]
ClickEventDependency = Annotated[ClickEventService, Depends(get_click_event_service)]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
            target_url=str(payload.target_url),
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
    except LinkNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found") from exc

    click_service.record_click(
        tenant_id=tenant_id,
        slug=slug,
        target_url=link.target_url,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    return RedirectResponse(url=link.target_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
