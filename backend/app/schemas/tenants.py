from pydantic import BaseModel, Field


class RegisterTenantRequest(BaseModel):
    tenant_name: str = Field(min_length=3, max_length=80)
    owner_email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)


class RegisterTenantResponse(BaseModel):
    tenant_id: str
    name: str
    owner_email: str
    status: str


class VerifyTenantEmailRequest(BaseModel):
    owner_email: str = Field(min_length=3, max_length=320)
    confirmation_code: str = Field(min_length=1, max_length=32)
