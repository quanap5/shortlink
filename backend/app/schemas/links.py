from datetime import datetime

from pydantic import AnyUrl, BaseModel, ConfigDict, Field


class CreateLinkRequest(BaseModel):
    slug: str | None = Field(default=None, min_length=3, max_length=64)
    target_url: AnyUrl


class LinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: str
    slug: str
    target_url: str
    created_at: datetime
    created_by: str | None = None


class LinksResponse(BaseModel):
    links: list[LinkResponse]
