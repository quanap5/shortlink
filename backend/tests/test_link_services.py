import pytest

from app.domain.errors import LinkAlreadyExistsError, LinkNotFoundError
from app.repositories.memory import InMemoryClickEventRepository, InMemoryLinkRepository
from app.services.links import ClickEventService, LinkCreationService, RedirectService


class FailingPublisher(InMemoryClickEventRepository):
    def publish(self, event):  # type: ignore[no-untyped-def]
        raise RuntimeError("sqs unavailable")


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


def test_create_link_generates_slug_when_missing() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    link = service.create_link(
        tenant_id="tenant-a",
        slug=None,
        target_url="https://example.com/very/long/path",
    )

    assert len(link.slug) >= 6
    assert links.get("tenant-a", link.slug) == link


def test_generated_slug_retries_on_collision() -> None:
    links = InMemoryLinkRepository()
    generator = iter(["abc123", "def456"]).__next__
    service = LinkCreationService(links, slug_generator=generator)
    service.create_link(tenant_id="tenant-a", slug="abc123", target_url="https://example.com/a")

    link = service.create_link(tenant_id="tenant-a", slug=None, target_url="https://example.com/b")

    assert link.slug == "def456"


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
        country_code="kr",
        referrer="https://google.com/search?q=shortlink",
        visitor_id="visitor-1",
    )

    assert events.events == [event]
    assert event.tenant_id == "tenant-a"
    assert event.slug == "docs"
    assert event.country_code == "KR"
    assert event.ip_hash
    assert event.user_agent_hash
    assert event.visitor_hash
    assert event.referrer == "google.com"
    assert event.device_family == "desktop"
    assert event.browser_family == "unknown"
    assert event.os_family == "unknown"
    assert not hasattr(event, "ip_address")
    assert not hasattr(event, "user_agent")


def test_click_event_service_classifies_mobile_chrome() -> None:
    events = InMemoryClickEventRepository()
    service = ClickEventService(events)

    event = service.record_click(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        user_agent=(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            "AppleWebKit/605.1.15 Chrome/120.0 Mobile Safari/604.1"
        ),
        country_code="US",
    )

    assert event.country_code == "US"
    assert event.device_family == "mobile"
    assert event.browser_family == "chrome"
    assert event.os_family == "ios"


def test_click_event_service_is_fail_soft_when_publisher_fails() -> None:
    service = ClickEventService(FailingPublisher())

    event = service.record_click(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
        user_agent="Mozilla/5.0",
        ip_address="127.0.0.1",
    )

    assert event.slug == "docs"
    assert event.ip_hash is not None
