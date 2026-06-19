from abc import ABC, abstractmethod

from app.domain.models import ClickEvent, Link


class LinkRepository(ABC):
    @abstractmethod
    def create(self, link: Link) -> Link:
        raise NotImplementedError

    @abstractmethod
    def get(self, tenant_id: str, slug: str) -> Link | None:
        raise NotImplementedError

    @abstractmethod
    def list_by_tenant(self, tenant_id: str) -> list[Link]:
        raise NotImplementedError


class ClickEventRepository(ABC):
    @abstractmethod
    def record(self, event: ClickEvent) -> ClickEvent:
        raise NotImplementedError


class ClickEventPublisher(ABC):
    @abstractmethod
    def publish(self, event: ClickEvent) -> ClickEvent:
        raise NotImplementedError
