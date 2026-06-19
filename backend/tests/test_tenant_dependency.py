import pytest

from app.api.tenant import (
    MissingTenantClaimError,
    get_tenant_id_from_event,
    require_tenant_id_from_event,
)


def test_tenant_id_defaults_when_no_authorizer_claims() -> None:
    assert get_tenant_id_from_event(None) == "default-tenant"


def test_tenant_id_uses_custom_claim_when_present() -> None:
    event = {
        "requestContext": {
            "authorizer": {
                "jwt": {
                    "claims": {
                        "custom:tenant_id": "tenant-a",
                        "sub": "user-123",
                    }
                }
            }
        }
    }

    assert get_tenant_id_from_event(event) == "tenant-a"


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
