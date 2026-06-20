import ipaddress
import logging
import re
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta
from hashlib import sha256
from urllib.parse import urlparse

from app.domain.errors import LinkAlreadyExistsError, LinkInactiveError, LinkNotFoundError
from app.domain.models import ClickEvent, Link, LinkStatus, RedirectType, utc_now
from app.repositories.interfaces import ClickEventPublisher, LinkRepository

logger = logging.getLogger(__name__)
SLUG_PATTERN = re.compile(r"^[a-z0-9-_]{3,64}$")
TAG_PATTERN = re.compile(r"^[a-z0-9-_]{1,24}$")
MAX_GENERATED_SLUG_ATTEMPTS = 8
MAX_TAGS_PER_LINK = 10
PRIVATE_HOSTNAMES = {"localhost"}
INTERNAL_HOST_SUFFIXES = (".internal", ".local", ".localhost", ".lan")


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
        expire_at: datetime | None = None,
        expire_after_days: int | None = None,
        status: LinkStatus = "active",
        redirect_type: RedirectType = 302,
        tags: list[str] | None = None,
        now: datetime | None = None,
    ) -> Link:
        now = now or utc_now()
        slug = normalize_slug(slug) if slug else self._generate_available_slug(tenant_id)
        if not SLUG_PATTERN.fullmatch(slug):
            raise ValueError("Slug must match ^[a-z0-9-_]{3,64}$.")
        target_url = validate_target_url(target_url)
        expire_at = resolve_expiration(
            expire_at=expire_at,
            expire_after_days=expire_after_days,
            now=now,
        )
        if status not in ("active", "disabled", "expired"):
            raise ValueError("Status must be active, disabled, or expired.")
        if redirect_type not in (301, 302, 307):
            raise ValueError("Redirect type must be 301, 302, or 307.")
        normalized_tags = normalize_tags(tags)
        if self._links.get(tenant_id, slug) or self._links.get_by_slug(slug):
            raise LinkAlreadyExistsError(slug)

        link = Link(
            tenant_id=tenant_id,
            slug=slug,
            target_url=target_url,
            created_at=now,
            created_by=created_by,
            expire_at=expire_at,
            status=status,
            redirect_type=redirect_type,
            tags=normalized_tags,
        )
        logger.info("link_created tenant_id=%s slug=%s", tenant_id, slug)
        return self._links.create(link)

    def _generate_available_slug(self, tenant_id: str) -> str:
        for _ in range(MAX_GENERATED_SLUG_ATTEMPTS):
            slug = self._slug_generator()
            if (
                SLUG_PATTERN.fullmatch(slug)
                and self._links.get(tenant_id, slug) is None
                and self._links.get_by_slug(slug) is None
            ):
                return slug
        raise ValueError("Unable to generate a unique slug.")


class RedirectService:
    def __init__(self, links: LinkRepository) -> None:
        self._links = links

    def resolve(self, *, tenant_id: str, slug: str, now: datetime | None = None) -> Link:
        link = self._links.get(tenant_id, slug)
        return self._resolve_link(link=link, slug=slug, now=now)

    def resolve_public(self, *, slug: str, now: datetime | None = None) -> Link:
        link = self._links.get_by_slug(slug)
        return self._resolve_link(link=link, slug=slug, now=now)

    def _resolve_link(self, *, link: Link | None, slug: str, now: datetime | None = None) -> Link:
        if link is None:
            raise LinkNotFoundError(slug)
        now = now or utc_now()
        if link.status == "disabled":
            raise LinkInactiveError("Link is disabled.")
        if link.status == "expired" or (link.expire_at is not None and link.expire_at <= now):
            raise LinkInactiveError("Link is expired.")
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
        source: str | None = None,
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
            source=normalize_source(source),
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
    return secrets.token_hex(4)


def normalize_slug(slug: str) -> str:
    return slug.strip().lower()


def normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    normalized_tags: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        normalized = tag.strip().lower()
        if not TAG_PATTERN.fullmatch(normalized):
            raise ValueError("Tag must match ^[a-z0-9-_]{1,24}$.")
        if normalized not in seen:
            normalized_tags.append(normalized)
            seen.add(normalized)
    if len(normalized_tags) > MAX_TAGS_PER_LINK:
        raise ValueError("Tags cannot include more than 10 unique values.")
    return normalized_tags


def validate_target_url(target_url: str) -> str:
    parsed = urlparse(target_url.strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Target URL must use http or https.")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("Target URL must include a valid host.")
    hostname = parsed.hostname.strip().lower()
    if hostname in PRIVATE_HOSTNAMES or hostname.endswith(INTERNAL_HOST_SUFFIXES):
        raise ValueError("Target URL cannot use localhost or internal hostnames.")
    if "." not in hostname and not _is_ip_address(hostname):
        raise ValueError("Target URL cannot use internal hostnames.")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        return parsed.geturl()
    if (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_unspecified
        or address.is_reserved
    ):
        raise ValueError("Target URL cannot use private or internal IP addresses.")
    return parsed.geturl()


def resolve_expiration(
    *,
    expire_at: datetime | None,
    expire_after_days: int | None,
    now: datetime,
) -> datetime | None:
    if expire_at is not None and expire_after_days is not None:
        raise ValueError("Use expire_at or expire_after_days, not both.")
    if expire_after_days is None:
        return expire_at
    if expire_after_days <= 0:
        raise ValueError("expire_after_days must be greater than 0.")
    return now + timedelta(days=expire_after_days)


def _is_ip_address(hostname: str) -> bool:
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        return False
    return True


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


def normalize_source(source: str | None) -> str:
    if not source:
        return "direct"
    normalized = source.strip().lower()
    return "qr" if normalized == "qr" else "direct"


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
