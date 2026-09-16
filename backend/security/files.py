"""Upload content-type validation via magic bytes (do not trust client MIME)."""

from __future__ import annotations

from pathlib import Path

JPEG_TYPES = {"image/jpeg"}
PNG_TYPES = {"image/png"}
GIF_TYPES = {"image/gif"}
WEBP_TYPES = {"image/webp"}

ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_IMAGE_EXTENSIONS = ALLOWED_PHOTO_EXTENSIONS  # SVG is intentionally excluded
ALLOWED_CSV_EXTENSIONS = {".csv"}
ALLOWED_DOCX_EXTENSIONS = {".docx"}


def sniff_image_type(content: bytes) -> str | None:
    """Return a trusted image MIME type, or None if the bytes are not a raster image."""
    if len(content) < 12:
        return None
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if content[:6] in {b"GIF87a", b"GIF89a"}:
        return "image/gif"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def is_svg_payload(content: bytes) -> bool:
    head = content[:256].lstrip().lower()
    return head.startswith(b"<svg") or b"<svg" in head[:120]


def sniff_docx(content: bytes) -> bool:
    """DOCX is a ZIP container; require ZIP magic plus a .docx extension at the caller."""
    return content[:4] == b"PK\x03\x04"


def sniff_csv_safe(content: bytes) -> bool:
    """Reject NUL bytes and obvious binary; CSV is otherwise validated by extension + size."""
    if not content:
        return False
    if b"\x00" in content[:8192]:
        return False
    if is_svg_payload(content):
        return False
    return sniff_image_type(content) is None


def extension_of(filename: str) -> str:
    return Path(filename or "").suffix.lower()
