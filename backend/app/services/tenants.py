import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

from app.domain.errors import TenantAlreadyExistsError, TenantRegistrationError
from app.domain.models import Tenant, utc_now
from app.repositories.interfaces import TenantRepository

logger = logging.getLogger(__name__)

TENANT_ID_PATTERN = re.compile(r"^[a-z0-9-]{3,64}$")
RESERVED_TENANT_IDS = {
    "admin",
    "api",
    "auth",
    "dashboard",
    "health",
    "link",
    "links",
    "login",
    "logout",
    "register",
    "support",
    "twinqx",
}


@dataclass(frozen=True)
class CognitoRegistrationUser:
    tenant_id: str
    role: Literal["owner"]
    email: str
    password: str


class CognitoRegistration(Protocol):
    def sign_up_owner(self, user: CognitoRegistrationUser) -> None:
        raise NotImplementedError


class TenantRegistrationService:
    def __init__(
        self,
        tenants: TenantRepository,
        cognito_registration: CognitoRegistration,
    ) -> None:
        self._tenants = tenants
        self._cognito_registration = cognito_registration

    def register_tenant(
        self,
        *,
        tenant_name: str,
        owner_email: str,
        password: str,
        now: datetime | None = None,
    ) -> Tenant:
        now = now or utc_now()
        tenant_id = normalize_tenant_id(tenant_name)
        validate_tenant_id(tenant_id)
        email = normalize_email(owner_email)
        if len(password) < 12:
            raise ValueError("Password must be at least 12 characters.")
        if self._tenants.get(tenant_id):
            raise TenantAlreadyExistsError(tenant_id)

        tenant = Tenant(
            tenant_id=tenant_id,
            name=tenant_name.strip(),
            owner_email=email,
            status="pending_verification",
            created_at=now,
        )
        self._tenants.create(tenant)
        try:
            self._cognito_registration.sign_up_owner(
                CognitoRegistrationUser(
                    tenant_id=tenant_id,
                    role="owner",
                    email=email,
                    password=password,
                )
            )
        except Exception as exc:
            self._tenants.delete(tenant_id)
            logger.exception("tenant_registration_cognito_failed tenant_id=%s", tenant_id)
            if isinstance(exc, TenantRegistrationError):
                raise
            raise TenantRegistrationError("Unable to register tenant.") from exc

        logger.info("tenant_registered tenant_id=%s owner_email=%s", tenant_id, email)
        return tenant


def normalize_tenant_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return re.sub(r"-+", "-", normalized).strip("-")


def validate_tenant_id(tenant_id: str) -> None:
    if not TENANT_ID_PATTERN.fullmatch(tenant_id):
        raise ValueError(
            "Tenant name must produce a 3-64 character id using letters, numbers, and hyphens."
        )
    if tenant_id in RESERVED_TENANT_IDS:
        raise ValueError("Tenant name is reserved.")


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValueError("Owner email must be valid.")
    return email
