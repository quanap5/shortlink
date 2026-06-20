from datetime import UTC, datetime, timedelta

import pytest

from app.api.routes import _float_header, redirect_link
from app.domain.errors import LinkAlreadyExistsError, LinkInactiveError, LinkNotFoundError
from app.domain.models import Link
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
        slug="launch-a",
        target_url="https://example.com/a",
    )
    tenant_b = service.create_link(
        tenant_id="tenant-b",
        slug="launch-b",
        target_url="https://example.com/b",
    )

    assert tenant_a.target_url == "https://example.com/a"
    assert tenant_b.target_url == "https://example.com/b"
    assert links.get("tenant-a", "launch-a") == tenant_a
    assert links.get("tenant-b", "launch-b") == tenant_b


def test_create_link_rejects_duplicate_slug_for_same_tenant() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)
    service.create_link(tenant_id="tenant-a", slug="launch", target_url="https://example.com")

    with pytest.raises(LinkAlreadyExistsError):
        service.create_link(tenant_id="tenant-a", slug="launch", target_url="https://example.org")


def test_create_link_rejects_duplicate_public_slug_across_tenants() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)
    service.create_link(tenant_id="tenant-a", slug="launch", target_url="https://example.com/a")

    with pytest.raises(LinkAlreadyExistsError):
        service.create_link(
            tenant_id="tenant-b",
            slug="launch",
            target_url="https://example.com/b",
        )


def test_create_link_generates_slug_when_missing() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    link = service.create_link(
        tenant_id="tenant-a",
        slug=None,
        target_url="https://example.com/very/long/path",
    )

    assert len(link.slug) >= 6
    assert link.slug == link.slug.lower()
    assert links.get("tenant-a", link.slug) == link


def test_generated_slug_retries_on_collision() -> None:
    links = InMemoryLinkRepository()
    generator = iter(["abc123", "def456"]).__next__
    service = LinkCreationService(links, slug_generator=generator)
    service.create_link(tenant_id="tenant-a", slug="abc123", target_url="https://example.com/a")

    link = service.create_link(tenant_id="tenant-a", slug=None, target_url="https://example.com/b")

    assert link.slug == "def456"


def test_create_link_normalizes_custom_slug_to_lowercase() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    link = service.create_link(
        tenant_id="tenant-a",
        slug="Launch_2026",
        target_url="https://example.com",
    )

    assert link.slug == "launch_2026"


def test_create_link_stores_normalized_tags() -> None:
    links = InMemoryLinkRepository()
    service = LinkCreationService(links)

    link = service.create_link(
        tenant_id="tenant-a",
        slug="launch",
        target_url="https://example.com",
        tags=[" Docs ", "LAUNCH", "docs", "campaign-1"],
    )

    assert link.tags == ["docs", "launch", "campaign-1"]
    assert links.get("tenant-a", "launch").tags == ["docs", "launch", "campaign-1"]


@pytest.mark.parametrize(
    "tags",
    [
        ["bad tag"],
        ["bad.tag"],
        ["a" * 25],
        [""],
        [f"tag-{index}" for index in range(11)],
    ],
)
def test_create_link_rejects_invalid_tags(tags: list[str]) -> None:
    service = LinkCreationService(InMemoryLinkRepository())

    with pytest.raises(ValueError, match="Tag"):
        service.create_link(
            tenant_id="tenant-a",
            slug="launch",
            target_url="https://example.com",
            tags=tags,
        )


@pytest.mark.parametrize(
    "target_url",
    [
        "javascript:alert(1)",
        "data:text/html;base64,PGgxPkhlbGxvPC9oMT4=",
        "file:///etc/passwd",
        "http://localhost:3000",
        "http://internal",
        "http://app.internal/path",
        "http://127.0.0.1:8000",
        "http://0.0.0.0",
        "http://10.0.0.5",
        "http://172.16.1.1",
        "http://192.168.1.2",
        "http://169.254.169.254",
    ],
)
def test_create_link_rejects_unsafe_target_urls(target_url: str) -> None:
    service = LinkCreationService(InMemoryLinkRepository())

    with pytest.raises(ValueError):
        service.create_link(tenant_id="tenant-a", slug="safe-slug", target_url=target_url)


@pytest.mark.parametrize("slug", ["ab", "bad.slug", "bad slug", "bad/slash"])
def test_create_link_rejects_invalid_slugs(slug: str) -> None:
    service = LinkCreationService(InMemoryLinkRepository())

    with pytest.raises(ValueError):
        service.create_link(tenant_id="tenant-a", slug=slug, target_url="https://example.com")


def test_create_link_supports_expiration_status_and_redirect_type() -> None:
    service = LinkCreationService(InMemoryLinkRepository())
    expire_at = datetime(2026, 7, 1, tzinfo=UTC)

    link = service.create_link(
        tenant_id="tenant-a",
        slug="launch",
        target_url="https://example.com",
        expire_at=expire_at,
        status="disabled",
        redirect_type=301,
    )

    assert link.expire_at == expire_at
    assert link.status == "disabled"
    assert link.redirect_type == 301


def test_create_link_supports_expire_after_days() -> None:
    service = LinkCreationService(InMemoryLinkRepository())
    now = datetime(2026, 6, 20, tzinfo=UTC)

    link = service.create_link(
        tenant_id="tenant-a",
        slug="launch",
        target_url="https://example.com",
        expire_after_days=10,
        now=now,
    )

    assert link.expire_at == now + timedelta(days=10)


def test_redirect_service_returns_target_link() -> None:
    links = InMemoryLinkRepository()
    create_service = LinkCreationService(links)
    redirect_service = RedirectService(links)
    create_service.create_link(tenant_id="tenant-a", slug="docs", target_url="https://example.com/docs")

    link = redirect_service.resolve(tenant_id="tenant-a", slug="docs")

    assert link.target_url == "https://example.com/docs"


def test_redirect_service_resolves_public_slug_without_tenant_claim() -> None:
    links = InMemoryLinkRepository()
    create_service = LinkCreationService(links)
    redirect_service = RedirectService(links)
    create_service.create_link(
        tenant_id="tenant-a",
        slug="docs",
        target_url="https://example.com/docs",
    )

    link = redirect_service.resolve_public(slug="docs")

    assert link.tenant_id == "tenant-a"
    assert link.target_url == "https://example.com/docs"


def test_redirect_service_rejects_disabled_and_expired_links() -> None:
    links = InMemoryLinkRepository()
    create_service = LinkCreationService(links)
    redirect_service = RedirectService(links)
    now = datetime(2026, 6, 20, tzinfo=UTC)
    create_service.create_link(
        tenant_id="tenant-a",
        slug="off",
        target_url="https://example.com/off",
        status="disabled",
    )
    create_service.create_link(
        tenant_id="tenant-a",
        slug="old",
        target_url="https://example.com/old",
        expire_at=now - timedelta(days=1),
    )

    with pytest.raises(LinkInactiveError, match="disabled"):
        redirect_service.resolve(tenant_id="tenant-a", slug="off", now=now)
    with pytest.raises(LinkInactiveError, match="expired"):
        redirect_service.resolve(tenant_id="tenant-a", slug="old", now=now)


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
        country="South Korea",
        region="Seoul",
        city="Seoul",
        latitude=37.5665,
        longitude=126.978,
        referrer="https://google.com/search?q=shortlink",
        visitor_id="visitor-1",
    )

    assert events.events == [event]
    assert event.tenant_id == "tenant-a"
    assert event.slug == "docs"
    assert event.country_code == "KR"
    assert event.country == "South Korea"
    assert event.region == "Seoul"
    assert event.city == "Seoul"
    assert event.latitude == 37.5665
    assert event.longitude == 126.978
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


class FakeRequest:
    def __init__(self, headers: dict[str, str], query_params: dict[str, str] | None = None) -> None:
        self.headers = headers
        self.query_params = query_params or {}
        self.cookies: dict[str, str] = {}
        self.client = None


def test_float_header_parses_cloudfront_geo_headers() -> None:
    request = FakeRequest(
        {
            "cloudfront-viewer-latitude": "37.5665",
            "cloudfront-viewer-longitude": "126.978",
            "bad-header": "not-a-number",
        }
    )

    assert _float_header(request, "cloudfront-viewer-latitude") == 37.5665  # type: ignore[arg-type]
    assert _float_header(request, "cloudfront-viewer-longitude") == 126.978  # type: ignore[arg-type]
    assert _float_header(request, "bad-header") is None  # type: ignore[arg-type]
    assert _float_header(request, "missing-header") is None  # type: ignore[arg-type]


class FakeRedirectService:
    def resolve_public(self, *, slug: str):
        return Link(
            tenant_id="tenant-a",
            slug=slug,
            target_url="https://example.com/docs",
            created_at=datetime(2026, 6, 20, tzinfo=UTC),
            redirect_type=301,
        )


class FakeClickService:
    def __init__(self) -> None:
        self.clicks: list[dict[str, object]] = []

    def record_click(self, **kwargs):  # type: ignore[no-untyped-def]
        self.clicks.append(kwargs)


def test_public_redirect_disables_browser_cache_for_analytics() -> None:
    click_service = FakeClickService()

    response = redirect_link(  # type: ignore[arg-type]
        slug="docs",
        request=FakeRequest({"user-agent": "pytest"}),
        redirect_service=FakeRedirectService(),
        click_service=click_service,
    )

    assert response.status_code == 301
    assert response.headers["location"] == "https://example.com/docs"
    assert response.headers["cache-control"] == "no-store"
    assert click_service.clicks[0]["tenant_id"] == "tenant-a"


def test_public_redirect_records_qr_source_when_present() -> None:
    click_service = FakeClickService()

    redirect_link(  # type: ignore[arg-type]
        slug="docs",
        request=FakeRequest({"user-agent": "pytest"}, query_params={"src": "qr"}),
        redirect_service=FakeRedirectService(),
        click_service=click_service,
    )

    assert click_service.clicks[0]["source"] == "qr"
