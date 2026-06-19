from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass(frozen=True)
class Link:
    tenant_id: str
    slug: str
    target_url: str
    created_at: datetime
    created_by: str | None = None


@dataclass(frozen=True)
class ClickEvent:
    tenant_id: str
    slug: str
    target_url: str
    occurred_at: datetime
    user_agent: str | None = None
    ip_address: str | None = None


def utc_now() -> datetime:
    return datetime.now(tz=UTC)
