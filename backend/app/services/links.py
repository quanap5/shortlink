import logging
import re

from app.domain.errors import LinkAlreadyExistsError, LinkNotFoundError
from app.domain.models import ClickEvent, Link, utc_now
from app.repositories.interfaces import ClickEventPublisher, LinkRepository

logger = logging.getLogger(__name__)
SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{3,64}$")


class LinkCreationService:
    def __init__(self, links: LinkRepository) -> None:
        self._links = links

    def create_link(
        self,
        *,
        tenant_id: str,
        slug: str,
        target_url: str,
        created_by: str | None = None,
    ) -> Link:
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
    ) -> ClickEvent:
        event = ClickEvent(
            tenant_id=tenant_id,
            slug=slug,
            target_url=target_url,
            occurred_at=utc_now(),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        logger.info("click_event_published tenant_id=%s slug=%s", tenant_id, slug)
        return self._click_events.publish(event)
