# Public Tenant Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure public tenant registration so a new customer can create a tenant, verify email through Cognito, and later sign in with a server-controlled `custom:tenant_id`.

**Architecture:** Add a backend-owned `POST /tenants/register` flow. Store tenants in DynamoDB, create Cognito users through a server-only app client with a secret, and prevent protected APIs from accepting authenticated users without a tenant claim. Keep Hosted UI for login and keep redirect routes public.

**Tech Stack:** Python 3.13, FastAPI, Pydantic v2, boto3 Cognito IDP, DynamoDB, AWS CDK, Cognito, Next.js, TypeScript, Tailwind, pytest, ruff, Node test runner.

---

## File Structure

- Create `backend/app/services/tenants.py`: tenant slug validation, registration service, Cognito adapter protocol.
- Create `backend/app/schemas/tenants.py`: request/response schemas for public registration.
- Modify `backend/app/domain/models.py`: add `Tenant` model and tenant status literal.
- Modify `backend/app/domain/errors.py`: add tenant conflict/validation/registration errors.
- Modify `backend/app/repositories/interfaces.py`: add `TenantRepository`.
- Modify `backend/app/repositories/memory.py`: add in-memory tenant repository.
- Modify `backend/app/repositories/dynamodb.py`: add DynamoDB tenant repository.
- Modify `backend/app/core/config.py`: add Cognito registration settings.
- Modify `backend/app/api/dependencies.py`: wire tenant repository and registration service.
- Modify `backend/app/api/tenant.py`: add strict protected tenant resolver.
- Modify `backend/app/api/routes.py`: add `POST /tenants/register`; keep handlers thin.
- Create `backend/tests/test_tenant_registration.py`: service and validation tests.
- Modify `backend/tests/test_tenant_dependency.py`: strict tenant claim tests.
- Modify `infra/lib/shortlink-stack.ts`: add TenantsTable, custom attributes, registration client, secret, env vars, route, IAM.
- Create `frontend/app/register/page.tsx`: public registration form.
- Modify `frontend/lib/api.ts`: add `registerTenant`.
- Modify `frontend/components/Shell.tsx` or nav source: add Register link where appropriate.
- Modify `frontend/tests/dashboard-icons.test.mjs`: add source-level check for register page.
- Modify `docs/AUTH.md`: document registration flow and security model.

---

### Task 1: Backend Tenant Domain And Repository Contracts

**Files:**
- Modify: `backend/app/domain/models.py`
- Modify: `backend/app/domain/errors.py`
- Modify: `backend/app/repositories/interfaces.py`
- Modify: `backend/app/repositories/memory.py`
- Test: `backend/tests/test_tenant_registration.py`

- [ ] **Step 1: Write failing domain/repository tests**

Create `backend/tests/test_tenant_registration.py` with:

```python
from datetime import UTC, datetime

import pytest

from app.domain.errors import TenantAlreadyExistsError
from app.domain.models import Tenant
from app.repositories.memory import InMemoryTenantRepository


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
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py -q
```

Expected: import failures for `Tenant`, `TenantAlreadyExistsError`, or `InMemoryTenantRepository`.

- [ ] **Step 3: Add tenant model and errors**

In `backend/app/domain/models.py`, add:

```python
TenantStatus = Literal["pending_verification", "active", "failed"]


@dataclass(frozen=True)
class Tenant:
    tenant_id: str
    name: str
    owner_email: str
    status: TenantStatus
    created_at: datetime
```

In `backend/app/domain/errors.py`, add:

```python
class TenantAlreadyExistsError(Exception):
    """Raised when a tenant id is already registered."""


class TenantRegistrationError(Exception):
    """Raised when tenant registration cannot be completed."""
```

- [ ] **Step 4: Add tenant repository interface**

In `backend/app/repositories/interfaces.py`, import `Tenant` and add:

```python
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
```

- [ ] **Step 5: Add memory implementation**

In `backend/app/repositories/memory.py`, add:

```python
class InMemoryTenantRepository(TenantRepository):
    def __init__(self) -> None:
        self._tenants: dict[str, Tenant] = {}

    def create(self, tenant: Tenant) -> Tenant:
        if tenant.tenant_id in self._tenants:
            raise TenantAlreadyExistsError(tenant.tenant_id)
        self._tenants[tenant.tenant_id] = tenant
        return tenant

    def get(self, tenant_id: str) -> Tenant | None:
        return self._tenants.get(tenant_id)

    def delete(self, tenant_id: str) -> None:
        self._tenants.pop(tenant_id, None)
```

Also update imports in that file for `Tenant`, `TenantRepository`, and `TenantAlreadyExistsError`.

- [ ] **Step 6: Run tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py -q
```

Expected: PASS.

---

### Task 2: Tenant Registration Service

**Files:**
- Create: `backend/app/services/tenants.py`
- Modify: `backend/tests/test_tenant_registration.py`

- [ ] **Step 1: Add failing service tests**

Append to `backend/tests/test_tenant_registration.py`:

```python
from app.domain.errors import TenantRegistrationError
from app.services.tenants import (
    RESERVED_TENANT_IDS,
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py -q
```

Expected: import failure for `app.services.tenants`.

- [ ] **Step 3: Implement service**

Create `backend/app/services/tenants.py`:

```python
import logging
import re
from dataclasses import dataclass
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
        now=None,
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
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized


def validate_tenant_id(tenant_id: str) -> None:
    if not TENANT_ID_PATTERN.fullmatch(tenant_id):
        raise ValueError("Tenant name must produce a 3-64 character id using letters, numbers, and hyphens.")
    if tenant_id in RESERVED_TENANT_IDS:
        raise ValueError("Tenant name is reserved.")


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValueError("Owner email must be valid.")
    return email
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py -q
```

Expected: PASS.

---

### Task 3: Cognito Registration Adapter And Config

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/app/repositories/cognito.py`
- Test: `backend/tests/test_tenant_registration.py`

- [ ] **Step 1: Add SECRET_HASH unit test**

Append to `backend/tests/test_tenant_registration.py`:

```python
import base64
import hashlib
import hmac

from app.repositories.cognito import compute_secret_hash


def test_compute_secret_hash_matches_cognito_algorithm() -> None:
    expected = base64.b64encode(
        hmac.new(
            "client-secret".encode("utf-8"),
            "owner@example.comclient-id".encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")

    assert compute_secret_hash(
        username="owner@example.com",
        client_id="client-id",
        client_secret="client-secret",
    ) == expected
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py::test_compute_secret_hash_matches_cognito_algorithm -q
```

Expected: import failure for `app.repositories.cognito`.

- [ ] **Step 3: Add settings**

In `backend/app/core/config.py`, add:

```python
cognito_registration_client_id: str | None = Field(default=None)
cognito_registration_client_secret: str | None = Field(default=None)
```

- [ ] **Step 4: Add Cognito adapter**

Create `backend/app/repositories/cognito.py`:

```python
import base64
import hashlib
import hmac

import boto3
from botocore.exceptions import ClientError

from app.domain.errors import TenantRegistrationError
from app.services.tenants import CognitoRegistrationUser


class CognitoRegistrationAdapter:
    def __init__(self, *, client_id: str, client_secret: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._client = boto3.client("cognito-idp")

    def sign_up_owner(self, user: CognitoRegistrationUser) -> None:
        try:
            self._client.sign_up(
                ClientId=self._client_id,
                SecretHash=compute_secret_hash(
                    username=user.email,
                    client_id=self._client_id,
                    client_secret=self._client_secret,
                ),
                Username=user.email,
                Password=user.password,
                UserAttributes=[
                    {"Name": "email", "Value": user.email},
                    {"Name": "custom:tenant_id", "Value": user.tenant_id},
                    {"Name": "custom:role", "Value": user.role},
                ],
            )
        except ClientError as exc:
            raise TenantRegistrationError("Unable to register user.") from exc


def compute_secret_hash(*, username: str, client_id: str, client_secret: str) -> str:
    message = f"{username}{client_id}".encode("utf-8")
    digest = hmac.new(client_secret.encode("utf-8"), message, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")
```

- [ ] **Step 5: Run test**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py::test_compute_secret_hash_matches_cognito_algorithm -q
```

Expected: PASS.

---

### Task 4: Backend Route, Schemas, Dependencies, And Strict Tenant Claim

**Files:**
- Create: `backend/app/schemas/tenants.py`
- Modify: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/tenant.py`
- Modify: `backend/app/api/routes.py`
- Modify: `backend/tests/test_tenant_dependency.py`
- Test: `backend/tests/test_tenant_registration.py`

- [ ] **Step 1: Add route and strict tenant tests**

Append to `backend/tests/test_tenant_dependency.py`:

```python
import pytest

from app.api.tenant import MissingTenantClaimError, require_tenant_id_from_event


def test_require_tenant_id_raises_when_claim_missing() -> None:
    with pytest.raises(MissingTenantClaimError):
        require_tenant_id_from_event({"requestContext": {"authorizer": {"jwt": {"claims": {}}}}})


def test_require_tenant_id_uses_custom_claim_when_present() -> None:
    event = {
        "requestContext": {
            "authorizer": {
                "jwt": {
                    "claims": {
                        "custom:tenant_id": "tenant-a",
                    }
                }
            }
        }
    }

    assert require_tenant_id_from_event(event) == "tenant-a"
```

Append to `backend/tests/test_tenant_registration.py`:

```python
from fastapi.testclient import TestClient

from app.api.dependencies import get_tenant_registration_service
from app.main import app


class FakeTenantRegistrationService:
    def register_tenant(self, *, tenant_name: str, owner_email: str, password: str, now=None):
        return Tenant(
            tenant_id="acme-inc",
            name=tenant_name,
            owner_email=owner_email.lower(),
            status="pending_verification",
            created_at=datetime(2026, 6, 20, tzinfo=UTC),
        )


def test_register_tenant_route_returns_pending_tenant() -> None:
    app.dependency_overrides[get_tenant_registration_service] = lambda: FakeTenantRegistrationService()
    client = TestClient(app)

    response = client.post(
        "/tenants/register",
        json={
            "tenant_name": "Acme Inc",
            "owner_email": "Owner@Example.com",
            "password": "CorrectHorseBatteryStaple1!",
        },
    )

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json() == {
        "tenant_id": "acme-inc",
        "name": "Acme Inc",
        "owner_email": "owner@example.com",
        "status": "pending_verification",
    }
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_dependency.py backend/tests/test_tenant_registration.py -q
```

Expected: missing route/schema/dependency failures.

- [ ] **Step 3: Add tenant schemas**

Create `backend/app/schemas/tenants.py`:

```python
from pydantic import BaseModel, EmailStr, Field


class RegisterTenantRequest(BaseModel):
    tenant_name: str = Field(min_length=3, max_length=80)
    owner_email: EmailStr
    password: str = Field(min_length=12, max_length=256)


class RegisterTenantResponse(BaseModel):
    tenant_id: str
    name: str
    owner_email: str
    status: str
```

If `email-validator` is not currently installed, either add it to `backend/requirements.txt` or replace `EmailStr` with `str` plus service validation. Prefer adding `email-validator>=2.2.0`.

- [ ] **Step 4: Add strict tenant resolver**

In `backend/app/api/tenant.py`, add:

```python
class MissingTenantClaimError(Exception):
    """Raised when an authenticated request has no tenant claim."""


def require_tenant_id_from_event(event: dict[str, object] | None) -> str:
    tenant_id = get_tenant_id_from_event(event)
    if tenant_id == "default-tenant":
        raise MissingTenantClaimError("Missing tenant claim.")
    return tenant_id
```

In `backend/app/api/dependencies.py`, update `get_tenant_id`:

```python
from fastapi import HTTPException, Request, status
from app.api.tenant import MissingTenantClaimError, require_tenant_id_from_event


def get_tenant_id(request: Request) -> str:
    event = request.scope.get("aws.event")
    if isinstance(event, dict):
        try:
            return require_tenant_id_from_event(event)
        except MissingTenantClaimError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing tenant claim.",
            ) from exc
    return "default-tenant"
```

This keeps local tests/dev usable while API Gateway-authenticated production requests fail closed.

- [ ] **Step 5: Wire registration dependency**

In `backend/app/api/dependencies.py`, add:

```python
from app.repositories.interfaces import TenantRepository
from app.services.tenants import TenantRegistrationService


@lru_cache
def get_tenant_repository() -> TenantRepository:
    settings = get_settings()
    if settings.tenants_table_name:
        from app.repositories.dynamodb import DynamoDBTenantRepository

        return DynamoDBTenantRepository(settings.tenants_table_name)
    return InMemoryTenantRepository()


@lru_cache
def get_cognito_registration():
    settings = get_settings()
    if settings.cognito_registration_client_id and settings.cognito_registration_client_secret:
        from app.repositories.cognito import CognitoRegistrationAdapter

        return CognitoRegistrationAdapter(
            client_id=settings.cognito_registration_client_id,
            client_secret=settings.cognito_registration_client_secret,
        )
    raise RuntimeError("Cognito registration is not configured.")


def get_tenant_registration_service() -> TenantRegistrationService:
    return TenantRegistrationService(get_tenant_repository(), get_cognito_registration())
```

Also add `tenants_table_name` to `Settings`.

- [ ] **Step 6: Add public route**

In `backend/app/api/routes.py`, import schemas/errors/service and add:

```python
from app.domain.errors import TenantAlreadyExistsError, TenantRegistrationError
from app.schemas.tenants import RegisterTenantRequest, RegisterTenantResponse
from app.services.tenants import TenantRegistrationService

TenantRegistrationDependency = Annotated[
    TenantRegistrationService,
    Depends(get_tenant_registration_service),
]


@router.post(
    "/tenants/register",
    response_model=RegisterTenantResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_tenant(
    payload: RegisterTenantRequest,
    service: TenantRegistrationDependency,
) -> RegisterTenantResponse:
    try:
        tenant = service.register_tenant(
            tenant_name=payload.tenant_name,
            owner_email=str(payload.owner_email),
            password=payload.password,
        )
    except TenantAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant already exists.",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except TenantRegistrationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to complete registration.",
        ) from exc
    return RegisterTenantResponse(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        owner_email=tenant.owner_email,
        status=tenant.status,
    )
```

- [ ] **Step 7: Run tests**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_dependency.py backend/tests/test_tenant_registration.py -q
```

Expected: PASS.

---

### Task 5: DynamoDB Tenant Repository

**Files:**
- Modify: `backend/app/repositories/dynamodb.py`
- Test: `backend/tests/test_tenant_registration.py`

- [ ] **Step 1: Add pure serialization test**

Append to `backend/tests/test_tenant_registration.py`:

```python
from app.repositories.dynamodb import _tenant_from_item


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
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py::test_tenant_from_dynamodb_item -q
```

Expected: import failure for `_tenant_from_item`.

- [ ] **Step 3: Implement DynamoDB repository**

In `backend/app/repositories/dynamodb.py`, add:

```python
class DynamoDBTenantRepository(TenantRepository):
    def __init__(self, table_name: str) -> None:
        self._table = boto3.resource("dynamodb").Table(table_name)

    def create(self, tenant: Tenant) -> Tenant:
        try:
            self._table.put_item(
                Item={
                    "tenant_id": tenant.tenant_id,
                    "name": tenant.name,
                    "owner_email": tenant.owner_email,
                    "status": tenant.status,
                    "created_at": tenant.created_at.isoformat(),
                },
                ConditionExpression="attribute_not_exists(tenant_id)",
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise TenantAlreadyExistsError(tenant.tenant_id) from exc
            raise
        return tenant

    def get(self, tenant_id: str) -> Tenant | None:
        response = self._table.get_item(Key={"tenant_id": tenant_id})
        item = response.get("Item")
        return _tenant_from_item(item) if item else None

    def delete(self, tenant_id: str) -> None:
        self._table.delete_item(Key={"tenant_id": tenant_id})


def _tenant_from_item(item: dict[str, object]) -> Tenant:
    return Tenant(
        tenant_id=str(item["tenant_id"]),
        name=str(item["name"]),
        owner_email=str(item["owner_email"]),
        status=str(item["status"]),  # type: ignore[arg-type]
        created_at=datetime.fromisoformat(str(item["created_at"])),
    )
```

Also update imports for `Tenant`, `TenantRepository`, `TenantAlreadyExistsError`, and `ClientError` if missing.

- [ ] **Step 4: Run test**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests/test_tenant_registration.py::test_tenant_from_dynamodb_item -q
```

Expected: PASS.

---

### Task 6: Infrastructure

**Files:**
- Modify: `infra/lib/shortlink-stack.ts`
- Test: `infra`

- [ ] **Step 1: Add TenantsTable**

In `infra/lib/shortlink-stack.ts`, after `analyticsAggregatesTable`, add:

```typescript
const tenantsTable = new dynamodb.Table(this, "TenantsTable", {
  partitionKey: { name: "tenant_id", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

- [ ] **Step 2: Add Cognito custom attributes**

Update `new cognito.UserPool`:

```typescript
const userPool = new cognito.UserPool(this, "UserPool", {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  autoVerify: { email: true },
  customAttributes: {
    tenant_id: new cognito.StringAttribute({ mutable: false, minLen: 3, maxLen: 64 }),
    role: new cognito.StringAttribute({ mutable: false, minLen: 3, maxLen: 32 }),
  },
  passwordPolicy: {
    minLength: 12,
    requireDigits: true,
    requireLowercase: true,
    requireSymbols: false,
    requireUppercase: true,
  },
  removalPolicy: RemovalPolicy.DESTROY,
});
```

- [ ] **Step 3: Add server registration client**

After `userPoolClient`, add:

```typescript
const registrationUserPoolClient = new cognito.UserPoolClient(
  this,
  "RegistrationUserPoolClient",
  {
    userPool,
    generateSecret: true,
    authFlows: {
      userSrp: true,
    },
    preventUserExistenceErrors: true,
    writeAttributes: new cognito.ClientAttributes()
      .withStandardAttributes({ email: true })
      .withCustomAttributes("tenant_id", "role"),
    readAttributes: new cognito.ClientAttributes()
      .withStandardAttributes({ email: true })
      .withCustomAttributes("tenant_id", "role"),
  },
);
```

Update Hosted UI client to restrict write attributes:

```typescript
writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true }),
readAttributes: new cognito.ClientAttributes()
  .withStandardAttributes({ email: true, emailVerified: true })
  .withCustomAttributes("tenant_id", "role"),
```

- [ ] **Step 4: Add backend env and grants**

Add to `backendEnvironment`:

```typescript
SHORTLINK_TENANTS_TABLE_NAME: tenantsTable.tableName,
SHORTLINK_COGNITO_REGISTRATION_CLIENT_ID:
  registrationUserPoolClient.userPoolClientId,
SHORTLINK_COGNITO_REGISTRATION_CLIENT_SECRET:
  registrationUserPoolClient.userPoolClientSecret.unsafeUnwrap(),
```

Grant tenant table access:

```typescript
tenantsTable.grantReadWriteData(backendFunction);
```

- [ ] **Step 5: Add public API route**

Before the `/{slug}` route, add:

```typescript
api.addRoutes({
  path: "/tenants/register",
  methods: [apigatewayv2.HttpMethod.POST],
  integration: backendIntegration,
});
```

- [ ] **Step 6: Build infra**

Run:

```powershell
npm.cmd run build
```

from `infra`.

Expected: TypeScript build passes.

---

### Task 7: Frontend Register Page

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/app/register/page.tsx`
- Modify: `frontend/components/Shell.tsx`
- Modify: `frontend/tests/dashboard-icons.test.mjs`

- [ ] **Step 1: Add frontend test**

Append to `frontend/tests/dashboard-icons.test.mjs`:

```javascript
const registerSource = readFileSync(new URL("../app/register/page.tsx", import.meta.url), "utf8");

test("register page includes tenant onboarding form", () => {
  assert.match(registerSource, /Create tenant/);
  assert.match(registerSource, /tenant_name/);
  assert.match(registerSource, /owner_email/);
  assert.match(registerSource, /password/);
  assert.match(registerSource, /Verify your email/);
});
```

- [ ] **Step 2: Add API function**

In `frontend/lib/api.ts`, add:

```typescript
export type RegisterTenantInput = {
  owner_email: string;
  password: string;
  tenant_name: string;
};

export type RegisterTenantResponse = {
  name: string;
  owner_email: string;
  status: "pending_verification" | "active" | "failed";
  tenant_id: string;
};

export async function registerTenant(input: RegisterTenantInput): Promise<RegisterTenantResponse> {
  const config = await loadAuthConfig();
  const response = await fetch(`${config.apiBaseUrl}/tenants/register`, {
    body: JSON.stringify(input),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return response.json() as Promise<RegisterTenantResponse>;
}
```

- [ ] **Step 3: Create register page**

Create `frontend/app/register/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { registerTenant } from "@/lib/api";

type RegisterState = "idle" | "submitting" | "success" | "error";

export default function RegisterPage() {
  const [tenantName, setTenantName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Create tenant");
  const [state, setState] = useState<RegisterState>("idle");

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("Creating tenant...");
    try {
      const tenant = await registerTenant({
        tenant_name: tenantName,
        owner_email: ownerEmail,
        password,
      });
      setState("success");
      setPassword("");
      setMessage(`Verify your email for ${tenant.name}, then sign in.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to register tenant.");
    }
  }

  return (
    <section className="retro-card-white mx-auto max-w-xl p-6">
      <p className="inline-flex border-2 border-ink bg-yellow px-2 py-1 text-xs font-black uppercase tracking-[0.14em]">
        Tenant onboarding
      </p>
      <h1 className="mt-3 text-3xl font-black tracking-normal">Create tenant</h1>
      <p className="mt-3 text-sm font-semibold text-ink/70">{message}</p>
      <form className="mt-6 space-y-4" onSubmit={submitRegistration}>
        <label className="block text-sm font-black text-ink">
          Tenant name
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            name="tenant_name"
            onChange={(event) => setTenantName(event.target.value)}
            required
            value={tenantName}
          />
        </label>
        <label className="block text-sm font-black text-ink">
          Owner email
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            name="owner_email"
            onChange={(event) => setOwnerEmail(event.target.value)}
            required
            type="email"
            value={ownerEmail}
          />
        </label>
        <label className="block text-sm font-black text-ink">
          Password
          <input
            className="mt-2 min-h-11 w-full border-4 border-ink bg-cream px-3 py-2 font-semibold outline-none focus:ring-4 focus:ring-yellow"
            minLength={12}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            className="retro-button retro-button-primary min-h-11 px-4 py-2 text-sm disabled:opacity-60"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Creating..." : "Create tenant"}
          </button>
          <Link className="font-black underline" href="/login">
            Sign in
          </Link>
        </div>
      </form>
      {state === "success" ? (
        <div className="mt-5 border-4 border-ink bg-vintage-mint p-4 text-sm font-black text-ink">
          Verify your email, then use Login to enter the dashboard.
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Add nav link**

In `frontend/components/Shell.tsx`, add a `Register` nav item next to Login if the shell owns nav items. If nav items are elsewhere, add:

```tsx
<Link className={navClassName} href="/register">
  Register
</Link>
```

- [ ] **Step 5: Run frontend tests**

Run from `frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all pass.

---

### Task 8: Docs And Full Verification

**Files:**
- Modify: `docs/AUTH.md`

- [ ] **Step 1: Update docs**

Append to `docs/AUTH.md`:

```markdown
## Public Tenant Registration

New tenants register at `/register`.

The browser calls `POST /tenants/register`; it does not write Cognito custom tenant attributes directly. Backend registration creates the tenant record, then signs up the owner through a server-only Cognito app client with `custom:tenant_id` and `custom:role=owner`.

After registration, Cognito sends the verification email. The user verifies email and signs in through the existing Hosted UI login page.

Protected APIs require `custom:tenant_id` in the JWT. Authenticated requests without this claim return `403`.
```

- [ ] **Step 2: Run backend verification**

Run from repo root:

```powershell
.\.venv\Scripts\ruff.exe check backend
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider backend/tests
```

Expected: ruff passes and all tests pass.

- [ ] **Step 3: Run frontend verification**

Run from `frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all pass.

- [ ] **Step 4: Run infra verification**

Run from `infra`:

```powershell
npm.cmd run build
npx.cmd cdk synth
```

Expected: TypeScript build and synth pass.

- [ ] **Step 5: Manual smoke after deploy**

After deployment, smoke test:

```powershell
curl.exe -I https://link.twinqx.com/register
curl.exe -i https://link.twinqx.com/health
```

Expected:

- `/register` returns `200 OK`.
- `/health` returns `{"status":"ok"}`.

Then complete manual Cognito flow:

1. Open `https://link.twinqx.com/register`.
2. Register a test tenant using an email inbox you control.
3. Verify email through Cognito.
4. Open `https://link.twinqx.com/login`.
5. Sign in.
6. Create a link.
7. Confirm links and analytics are tenant-scoped to the new tenant.

---

## Self-Review

- Spec coverage: the plan implements backend-owned registration, tenant persistence, Cognito server client, frontend register UI, strict tenant claims, tests, docs, and infra.
- Scope check: invitation UI remains a documented future follow-up, matching the spec non-goal.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation markers are present.
- Type consistency: tenant fields use `tenant_id`, `name`, `owner_email`, `status`, `created_at`; Cognito custom attributes use `custom:tenant_id` and `custom:role`.
