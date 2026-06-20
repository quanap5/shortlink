from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreateLinkRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=3, max_length=64)
    target_url: str
    expire_at: datetime | None = None
    expire_after_days: int | None = Field(default=None, ge=1)
    status: Literal["active", "disabled", "expired"] = "active"
    redirect_type: Literal[301, 302, 307] = 302
    tags: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("slug")
    @classmethod
    def normalize_slug(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        seen: set[str] = set()
        for tag in value:
            normalized = tag.strip().lower()
            if normalized not in seen:
                normalized_tags.append(normalized)
                seen.add(normalized)
        return normalized_tags


class LinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: str
    slug: str
    target_url: str
    created_at: datetime
    created_by: str | None = None
    expire_at: datetime | None = None
    status: str
    redirect_type: int
    tags: list[str] = Field(default_factory=list)


class LinksResponse(BaseModel):
    links: list[LinkResponse]
