from abc import ABC, abstractmethod

from app.domain.models import (
    AnalyticsAggregate,
    ClickEvent,
    Link,
    LinkAnalyticsListItem,
    LinkAnalyticsSummary,
    Tenant,
)


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


class TenantRepository(ABC):
    @abstractmethod
    def create(self, tenant: Tenant) -> Tenant:
        raise NotImplementedError

    @abstractmethod
    def get(self, tenant_id: str) -> Tenant | None:
        raise NotImplementedError

    @abstractmethod
    def delete(self, tenant_id: str) -> None:
        raise NotImplementedError


class ClickEventRepository(ABC):
    @abstractmethod
    def record(self, event: ClickEvent) -> ClickEvent:
        raise NotImplementedError

    @abstractmethod
    def list_by_link(self, tenant_id: str, slug: str, limit: int = 50) -> list[ClickEvent]:
        raise NotImplementedError

    @abstractmethod
    def list_by_tenant(self, tenant_id: str, limit: int = 500) -> list[ClickEvent]:
        raise NotImplementedError

    @abstractmethod
    def get_link_summary(self, tenant_id: str, slug: str) -> LinkAnalyticsSummary:
        raise NotImplementedError

    @abstractmethod
    def list_link_summaries(self, tenant_id: str) -> list[LinkAnalyticsListItem]:
        raise NotImplementedError


class ClickEventPublisher(ABC):
    @abstractmethod
    def publish(self, event: ClickEvent) -> ClickEvent:
        raise NotImplementedError


class AnalyticsAggregateRepository(ABC):
    @abstractmethod
    def increment(
        self,
        *,
        tenant_id: str,
        metric_key: str,
        amount: int = 1,
        labels: dict[str, str] | None = None,
    ) -> AnalyticsAggregate:
        raise NotImplementedError

    @abstractmethod
    def query_by_prefix(self, *, tenant_id: str, prefix: str) -> list[AnalyticsAggregate]:
        raise NotImplementedError
