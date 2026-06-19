import logging
import re
import secrets
from collections.abc import Callable
from hashlib import sha256
from urllib.parse import urlparse

from app.domain.errors import LinkAlreadyExistsError, LinkNotFoundError
from app.domain.models import ClickEvent, Link, utc_now
from app.repositories.interfaces import ClickEventPublisher, LinkRepository

logger = logging.getLogger(__name__)
SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{3,64}$")
MAX_GENERATED_SLUG_ATTEMPTS = 8


class LinkCreationService:
    def __init__(
        self,
        links: LinkRepository,
        slug_generator: Callable[[], str] | None = None,
    ) -> None:
        self._links = links
        self._slug_generator = slug_generator or generate_slug

    def create_link(
        self,
        *,
        tenant_id: str,
        slug: str | None,
        target_url: str,
        created_by: str | None = None,
    ) -> Link:
        slug = slug.strip() if slug else self._generate_available_slug(tenant_id)
        if not SLUG_PATTERN.fullmatch(slug):
            raise ValueError("Slug must be 3-64 characters and URL-safe.")
        if self._links.get(tenant_id, slug):
            raise LinkAlreadyExistsError(slug)

        link = Link(
            tenant_id=tenant_id,
            slug=slug,
            target_url=target_url,
            created_at=utc_now(),
            created_by=created_by,
        )
        logger.info("link_created tenant_id=%s slug=%s", tenant_id, slug)
        return self._links.create(link)

    def _generate_available_slug(self, tenant_id: str) -> str:
        for _ in range(MAX_GENERATED_SLUG_ATTEMPTS):
            slug = self._slug_generator()
            if SLUG_PATTERN.fullmatch(slug) and self._links.get(tenant_id, slug) is None:
                return slug
        raise ValueError("Unable to generate a unique slug.")


class RedirectService:
    def __init__(self, links: LinkRepository) -> None:
        self._links = links

    def resolve(self, *, tenant_id: str, slug: str) -> Link:
        link = self._links.get(tenant_id, slug)
        if link is None:
            raise LinkNotFoundError(slug)
        return link


class ClickEventService:
    def __init__(self, click_events: ClickEventPublisher) -> None:
        self._click_events = click_events

    def record_click(
        self,
        *,
        tenant_id: str,
        slug: str,
        target_url: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
        country_code: str | None = None,
        country: str | None = None,
        region: str | None = None,
        city: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        referrer: str | None = None,
        visitor_id: str | None = None,
    ) -> ClickEvent:
        ip_hash = hash_text(ip_address)
        user_agent_hash = hash_text(user_agent)
        event = ClickEvent(
            tenant_id=tenant_id,
            slug=slug,
            target_url=target_url,
            occurred_at=utc_now(),
            visitor_hash=hash_text(visitor_id) or hash_text(f"{ip_hash}:{user_agent_hash}"),
            ip_hash=ip_hash,
            user_agent_hash=user_agent_hash,
            country_code=normalize_country_code(country_code),
            country=country,
            region=region,
            city=city,
            latitude=latitude,
            longitude=longitude,
            referrer=normalize_referrer(referrer),
            device_family=classify_device(user_agent),
            browser_family=classify_browser(user_agent),
            os_family=classify_os(user_agent),
        )
        logger.info("click_event_published tenant_id=%s slug=%s", tenant_id, slug)
        try:
            return self._click_events.publish(event)
        except Exception:
            logger.exception("click_event_publish_failed tenant_id=%s slug=%s", tenant_id, slug)
            return event


def generate_slug() -> str:
    return secrets.token_urlsafe(6).replace("-", "_")[:8]


def normalize_country_code(country_code: str | None) -> str | None:
    if not country_code:
        return None
    normalized = country_code.strip().upper()
    if len(normalized) != 2 or not normalized.isalpha():
        return None
    return normalized


def hash_text(value: str | None) -> str | None:
    if not value:
        return None
    return sha256(value.strip().encode("utf-8")).hexdigest()


def normalize_referrer(referrer: str | None) -> str:
    if not referrer:
        return "direct"
    parsed = urlparse(referrer)
    host = parsed.netloc or parsed.path
    host = host.lower().removeprefix("www.")
    return host or "direct"


def classify_device(user_agent: str | None) -> str:
    value = (user_agent or "").lower()
    if not value:
        return "unknown"
    if any(token in value for token in ("bot", "crawler", "spider", "slurp")):
        return "bot"
    if "ipad" in value or "tablet" in value:
        return "tablet"
    if any(token in value for token in ("mobile", "iphone", "android")):
        return "mobile"
    return "desktop"


def classify_browser(user_agent: str | None) -> str:
    value = (user_agent or "").lower()
    if not value:
        return "unknown"
    if any(token in value for token in ("bot", "crawler", "spider", "slurp")):
        return "bot"
    if "edg/" in value or "edge/" in value:
        return "edge"
    if "opr/" in value or "opera/" in value:
        return "opera"
    if "samsungbrowser/" in value:
        return "samsung"
    if "firefox/" in value:
        return "firefox"
    if "chrome/" in value or "crios/" in value:
        return "chrome"
    if "safari/" in value:
        return "safari"
    return "unknown"


def classify_os(user_agent: str | None) -> str:
    value = (user_agent or "").lower()
    if not value:
        return "unknown"
    if any(token in value for token in ("bot", "crawler", "spider", "slurp")):
        return "bot"
    if "windows" in value:
        return "windows"
    if "iphone" in value or "ipad" in value or "cpu iphone os" in value:
        return "ios"
    if "android" in value:
        return "android"
    if "mac os x" in value or "macintosh" in value:
        return "macos"
    if "linux" in value:
        return "linux"
    return "unknown"
