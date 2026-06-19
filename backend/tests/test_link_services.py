import pytest

from app.domain.errors import LinkAlreadyExistsError, LinkNotFoundError
from app.repositories.memory import InMemoryClickEventRepository, InMemoryLinkRepository
from app.services.links import ClickEventService, LinkCreationService, RedirectService


def test_create_link_is_tenant_isolated() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    tenant_a = service.create_link(
        tenant_id="tenant-a",
        slug="launch",
        target_url="https://example.com/a",
    )
    tenant_b = service.create_link(
        tenant_id="tenant-b",
        slug="launch",
        target_url="https://example.com/b",
    )

    assert tenant_a.target_url == "https://example.com/a"
    assert tenant_b.target_url == "https://example.com/b"
    assert links.get("tenant-a", "launch") == tenant_a
    assert links.get("tenant-b", "launch") == tenant_b


def test_create_link_rejects_duplicate_slug_for_same_tenant() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)
    service.create_link(tenant_id="tenant-a", slug="launch", target_url="https://example.com")

    with pytest.raises(LinkAlreadyExistsError):
        service.create_link(tenant_id="tenant-a", slug="launch", target_url="https://example.org")


def test_redirect_service_returns_target_link() -> None:
    links = InMemoryLinkRepository()
    create_service = LinkCreationService(links)
    redirect_service = RedirectService(links)
    create_service.create_link(tenant_id="tenant-a", slug="docs", target_url="https://example.com/docs")

    link = redirect_service.resolve(tenant_id="tenant-a", slug="docs")

    assert link.target_url == "https://example.com/docs"


def test_redirect_service_raises_when_missing() -> None:
    redirect_service = RedirectService(InMemoryLinkRepository())

    with pytest.raises(LinkNotFoundError):
        redirect_service.resolve(tenant_id="tenant-a", slug="missing")


def test_click_event_service_records_event() -> None:
    events = InMemoryClickEventRepository()
    service = ClickEventService(events)

    event = service.record_click(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        user_agent="pytest",
        ip_address="127.0.0.1",
    )

    assert events.events == [event]
    assert event.tenant_id == "tenant-a"
    assert event.slug == "docs"
