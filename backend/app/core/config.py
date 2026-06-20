from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SHORTLINK_", env_file=".env")

    app_name: str = "ShortLink API"
    environment: str = "local"
    links_table_name: str | None = Field(default=None)
    tenants_table_name: str | None = Field(default=None)
    click_events_table_name: str | None = Field(default=None)
    analytics_aggregates_table_name: str | None = Field(default=None)
    click_events_queue_url: str | None = Field(default=None)
    cognito_registration_client_id: str | None = Field(default=None)
    cognito_registration_client_secret: str | None = Field(default=None)
    public_base_url: str = "https://link.twinqx.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
