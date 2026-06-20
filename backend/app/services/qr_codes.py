from dataclasses import dataclass
from io import BytesIO
from typing import Literal
from urllib.parse import quote

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from qrcode.image.svg import SvgPathImage

from app.domain.errors import LinkNotFoundError
from app.repositories.interfaces import LinkRepository

QrFormat = Literal["png", "svg"]


@dataclass(frozen=True)
class QrCodeAsset:
    content: bytes
    filename: str
    media_type: str


class QrCodeService:
    def __init__(self, links: LinkRepository, public_base_url: str) -> None:
        self._links = links
        self._public_base_url = public_base_url.rstrip("/")

    def generate_for_link(
        self,
        *,
        tenant_id: str,
        slug: str,
        image_format: QrFormat,
    ) -> QrCodeAsset:
        link = self._links.get(tenant_id, slug)
        if link is None:
            raise LinkNotFoundError(slug)
        short_url = self.short_url_for_slug(slug, include_tracking_source=True)
        if image_format == "png":
            return QrCodeAsset(
                content=self._generate_png(short_url),
                filename=f"{slug}-qr.png",
                media_type="image/png",
            )
        return QrCodeAsset(
            content=self._generate_svg(short_url),
            filename=f"{slug}-qr.svg",
            media_type="image/svg+xml",
        )

    def short_url_for_slug(self, slug: str, *, include_tracking_source: bool) -> str:
        url = f"{self._public_base_url}/{quote(slug)}"
        return f"{url}?src=qr" if include_tracking_source else url

    def _qr(self, value: str) -> qrcode.QRCode:
        qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=10, border=4)
        qr.add_data(value)
        qr.make(fit=True)
        return qr

    def _generate_png(self, value: str) -> bytes:
        image = self._qr(value).make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def _generate_svg(self, value: str) -> bytes:
        image = self._qr(value).make_image(image_factory=SvgPathImage)
        svg = image.to_string(encoding="unicode")
        title = f"<title>{_escape_xml(value)}</title>"
        return svg.replace(">", f">{title}", 1).encode("utf-8")


def _escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
