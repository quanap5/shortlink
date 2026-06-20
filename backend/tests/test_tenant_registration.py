import base64
import hashlib
import hmac
from datetime import UTC, datetime

import pytest

from app.api.routes import register_tenant
from app.domain.errors import TenantAlreadyExistsError, TenantRegistrationError
from app.domain.models import Tenant
from app.repositories.cognito import compute_secret_hash
from app.repositories.dynamodb import _tenant_from_item
from app.repositories.memory import InMemoryTenantRepository
from app.schemas.tenants import RegisterTenantRequest, VerifyTenantEmailRequest
from app.services.tenants import (
    CognitoRegistrationUser,
    TenantRegistrationService,
    normalize_tenant_id,
)


class FakeCognitoRegistration:
    def __init__(self, *, should_fail: bool = False) -> None:
        self.should_fail = should_fail
        self.created_users: list[CognitoRegistrationUser] = []

    def sign_up_owner(self, user: CognitoRegistrationUser) -> None:
        if self.should_fail:
            raise TenantRegistrationError("cognito unavailable")
        self.created_users.append(user)

    def confirm_owner_email(self, *, email: str, confirmation_code: str) -> None:
        if self.should_fail:
            raise TenantRegistrationError("cognito unavailable")
        self.confirmed_email = email
        self.confirmed_code = confirmation_code


def test_memory_tenant_repository_rejects_duplicate_tenant_id() -> None:
    repository = InMemoryTenantRepository()
    tenant = Tenant(
        tenant_id="acme-inc",
        name="Acme Inc",
        owner_email="owner@example.com",
        status="pending_verification",
        created_at=datetime(2026, 6, 20, tzinfo=UTC),
    )
    repository.create(tenant)

    with pytest.raises(TenantAlreadyExistsError):
        repository.create(tenant)


def test_memory_tenant_repository_gets_tenant_by_id() -> None:
    repository = InMemoryTenantRepository()
    tenant = Tenant(
        tenant_id="acme-inc",
        name="Acme Inc",
        owner_email="owner@example.com",
        status="pending_verification",
        created_at=datetime(2026, 6, 20, tzinfo=UTC),
    )

    repository.create(tenant)

    assert repository.get("acme-inc") == tenant
    assert repository.get("missing") is None


def test_normalize_tenant_id_from_display_name() -> None:
    assert normalize_tenant_id(" Acme, Inc! ") == "acme-inc"


@pytest.mark.parametrize("name", ["ab", "admin", "support", "login", "links"])
def test_register_tenant_rejects_reserved_or_invalid_names(name: str) -> None:
    service = TenantRegistrationService(InMemoryTenantRepository(), FakeCognitoRegistration())

    with pytest.raises(ValueError):
        service.register_tenant(
            tenant_name=name,
            owner_email="owner@example.com",
            password="CorrectHorseBatteryStaple1!",
            now=datetime(2026, 6, 20, tzinfo=UTC),
        )


def test_register_tenant_creates_pending_tenant_and_cognito_owner() -> None:
    tenants = InMemoryTenantRepository()
    cognito = FakeCognitoRegistration()
    service = TenantRegistrationService(tenants, cognito)

    tenant = service.register_tenant(
        tenant_name="Acme Inc",
        owner_email="Owner@Example.com",
        password="CorrectHorseBatteryStaple1!",
        now=datetime(2026, 6, 20, tzinfo=UTC),
    )

    assert tenant.tenant_id == "acme-inc"
    assert tenant.status == "pending_verification"
    assert tenants.get("acme-inc") == tenant
    assert cognito.created_users == [
        CognitoRegistrationUser(
            tenant_id="acme-inc",
            role="owner",
            email="owner@example.com",
            password="CorrectHorseBatteryStaple1!",
        )
    ]


def test_register_tenant_rolls_back_pending_tenant_when_cognito_fails() -> None:
    tenants = InMemoryTenantRepository()
    service = TenantRegistrationService(tenants, FakeCognitoRegistration(should_fail=True))

    with pytest.raises(TenantRegistrationError):
        service.register_tenant(
            tenant_name="Acme Inc",
            owner_email="owner@example.com",
            password="CorrectHorseBatteryStaple1!",
            now=datetime(2026, 6, 20, tzinfo=UTC),
        )

    assert tenants.get("acme-inc") is None


def test_verify_tenant_owner_email_confirms_cognito_signup() -> None:
    cognito = FakeCognitoRegistration()
    service = TenantRegistrationService(InMemoryTenantRepository(), cognito)

    service.verify_owner_email(
        owner_email=" Owner@Example.com ",
        confirmation_code=" 123456 ",
    )

    assert cognito.confirmed_email == "owner@example.com"
    assert cognito.confirmed_code == "123456"


def test_compute_secret_hash_matches_cognito_algorithm() -> None:
    expected = base64.b64encode(
        hmac.new(
            b"client-secret",
            b"owner@example.comclient-id",
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")

    assert (
        compute_secret_hash(
            username="owner@example.com",
            client_id="client-id",
            client_secret="client-secret",
        )
        == expected
    )


def test_tenant_from_dynamodb_item() -> None:
    tenant = _tenant_from_item(
        {
            "tenant_id": "acme-inc",
            "name": "Acme Inc",
            "owner_email": "owner@example.com",
            "status": "pending_verification",
            "created_at": "2026-06-20T00:00:00+00:00",
        }
    )

    assert tenant.tenant_id == "acme-inc"
    assert tenant.created_at == datetime(2026, 6, 20, tzinfo=UTC)


class FakeTenantRegistrationService:
    def register_tenant(
        self,
        *,
        tenant_name: str,
        owner_email: str,
        password: str,
        now=None,
    ) -> Tenant:
        return Tenant(
            tenant_id="acme-inc",
            name=tenant_name,
            owner_email=owner_email.lower(),
            status="pending_verification",
            created_at=datetime(2026, 6, 20, tzinfo=UTC),
        )


def test_register_tenant_route_returns_pending_tenant_response() -> None:
    response = register_tenant(
        RegisterTenantRequest(
            tenant_name="Acme Inc",
            owner_email="Owner@Example.com",
            password="CorrectHorseBatteryStaple1!",
        ),
        FakeTenantRegistrationService(),  # type: ignore[arg-type]
    )

    assert response.tenant_id == "acme-inc"
    assert response.name == "Acme Inc"
    assert response.owner_email == "owner@example.com"
    assert response.status == "pending_verification"


class FakeTenantVerificationService(FakeTenantRegistrationService):
    def verify_owner_email(self, *, owner_email: str, confirmation_code: str) -> None:
        self.owner_email = owner_email
        self.confirmation_code = confirmation_code


def test_verify_tenant_email_route_confirms_owner_signup() -> None:
    from app.api.routes import verify_tenant_email

    service = FakeTenantVerificationService()
    response = verify_tenant_email(
        VerifyTenantEmailRequest(
            owner_email="Owner@Example.com",
            confirmation_code="123456",
        ),
        service,  # type: ignore[arg-type]
    )

    assert response == {"status": "verified"}
    assert service.owner_email == "Owner@Example.com"
    assert service.confirmation_code == "123456"
