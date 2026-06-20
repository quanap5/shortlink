from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_link_repository
from app.domain.models import Link
from app.main import app
from app.repositories.memory import InMemoryLinkRepository


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def test_qr_endpoint_returns_png_with_image_png() -> None:
    client = _client_with_link()

    response = client.get("/api/links/docs/qr?format=png")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/png")
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_qr_endpoint_returns_svg_with_image_svg_xml() -> None:
    client = _client_with_link()

    response = client.get("/api/links/docs/qr?format=svg")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert "<svg" in response.text


def test_qr_uses_short_url_not_long_url() -> None:
    client = _client_with_link()

    response = client.get("/api/links/docs/qr?format=svg")

    assert response.status_code == 200
    assert "https://link.twinqx.com/docs?src=qr" in response.text
    assert "https://example.com/docs" not in response.text


def test_qr_download_sets_attachment_headers() -> None:
    client = _client_with_link()

    response = client.get("/api/links/docs/qr/download?format=svg")

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="docs-qr.svg"'


def test_qr_endpoint_returns_404_for_invalid_link_id() -> None:
    client = _client_with_link()

    response = client.get("/api/links/missing/qr?format=png")

    assert response.status_code == 404
    assert response.json()["detail"] == "Link not found"


def _client_with_link() -> TestClient:
    repository = InMemoryLinkRepository()
    repository.create(
        Link(
            tenant_id="default-tenant",
            slug="docs",
            target_url="https://example.com/docs",
            created_at=datetime(2026, 6, 21, tzinfo=UTC),
        )
    )
    app.dependency_overrides[get_link_repository] = lambda: repository
    return TestClient(app)
