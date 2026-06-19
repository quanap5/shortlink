from app.domain.models import ClickEvent, Link
from app.repositories.interfaces import ClickEventPublisher, ClickEventRepository, LinkRepository


class InMemoryLinkRepository(LinkRepository):
    def __init__(self) -> None:
        self._links: dict[tuple[str, str], Link] = {}

    def create(self, link: Link) -> Link:
        self._links[(link.tenant_id, link.slug)] = link
        return link

    def get(self, tenant_id: str, slug: str) -> Link | None:
        return self._links.get((tenant_id, slug))

    def list_by_tenant(self, tenant_id: str) -> list[Link]:
        return [link for link in self._links.values() if link.tenant_id == tenant_id]


class InMemoryClickEventRepository(ClickEventPublisher, ClickEventRepository):
    def __init__(self) -> None:
        self.events: list[ClickEvent] = []

    def record(self, event: ClickEvent) -> ClickEvent:
        self.events.append(event)
        return event

    def publish(self, event: ClickEvent) -> ClickEvent:
        return self.record(event)
