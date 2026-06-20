# ShortLink QR Code Plan

## Goal
Add dynamic QR codes for each shortlink. QR codes must encode the final public short URL, support preview/download in the list UI, and record QR scans as analytics source `qr`.

## Constraints
- MVP only; do not add persistent QR image storage.
- Keep QR generation in a service, not in API route handlers.
- Use high QR error correction.
- Preserve existing public redirect behavior and tenant isolation.
- Support the requested `/api/links/{id}/qr` route while keeping current API compatibility.

## Phase 1 Tasks
1. Backend QR generation
   - Add a small `QrCodeService`.
   - Build QR content from `SHORTLINK_PUBLIC_BASE_URL` plus `/{slug}?src=qr`.
   - Generate PNG and SVG dynamically with high error correction.
   - Return 404 when the tenant-scoped link is missing.

2. Backend endpoints
   - Add `GET /api/links/{slug}/qr?format=png|svg`.
   - Add `GET /api/links/{slug}/qr/download?format=png|svg`.
   - Also expose `/links/{slug}/qr` and `/links/{slug}/qr/download` for current API style.
   - Set correct media types and download headers.

3. QR analytics source
   - Add `source` to `ClickEvent`.
   - Pass `src=qr` from redirect requests into `ClickEventService`.
   - Add source aggregates so analytics can query QR traffic later.

4. Frontend UI
   - Add authenticated blob helpers for QR preview and downloads.
   - Add QR preview/download controls to the links list row.
   - Keep the retro/vintage UI style and compact table layout.

5. Tests and verification
   - Add backend tests for PNG, SVG, short URL content, and 404.
   - Add backend test for `src=qr` source tracking.
   - Add frontend static tests for QR preview/download wiring.
   - Run backend pytest/ruff and frontend test/lint/build.
