"""Extract text from uploaded PDFs and convert to report blocks."""

from __future__ import annotations

import re
import uuid
from io import BytesIO

from reports.pdf_analyze import analyze_pdf_layout


def _new_block_id() -> str:
    return str(uuid.uuid4())


def extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF import requires pypdf on the server") from exc

    reader = PdfReader(BytesIO(content))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text.strip())
    return "\n\n".join(parts).strip()


def _title_from_filename(filename: str) -> str:
    base = filename
    if base.lower().endswith(".pdf"):
        base = base[:-4]
    base = base.replace("_", " ").replace("-", " ").strip()
    return base or "Untitled PDF"


def pdf_text_to_blocks(title: str, text: str) -> list[dict]:
    """Turn extracted PDF text into editable report blocks."""
    blocks: list[dict] = [
        {"id": _new_block_id(), "type": "title", "text": title, "align": "left"},
    ]

    if not text.strip():
        blocks.append(
            {"id": _new_block_id(), "type": "paragraph", "text": "", "align": "left"}
        )
        return blocks

    chunks = [c.strip() for c in re.split(r"\n\s*\n+", text) if c.strip()]
    for chunk in chunks[:200]:
        lines = [ln.strip() for ln in chunk.splitlines() if ln.strip()]
        one_line = " ".join(lines)

        if len(lines) == 1 and len(one_line) <= 80 and one_line.isupper():
            blocks.append(
                {
                    "id": _new_block_id(),
                    "type": "heading",
                    "text": one_line,
                    "align": "left",
                }
            )
            continue

        bullet_items = [
            re.sub(r"^[\u2022\-\*•]\s*", "", ln).strip()
            for ln in lines
            if re.match(r"^[\u2022\-\*•]\s+", ln)
        ]
        if bullet_items and len(bullet_items) >= len(lines) * 0.6:
            blocks.append(
                {
                    "id": _new_block_id(),
                    "type": "bullets",
                    "items": bullet_items[:40],
                    "align": "left",
                }
            )
            continue

        if len(one_line) > 900:
            one_line = one_line[:897] + "…"
        blocks.append(
            {"id": _new_block_id(), "type": "paragraph", "text": one_line, "align": "left"}
        )

    return blocks


def build_report_from_pdf(filename: str, content: bytes) -> tuple[str, list[dict]]:
    title = _title_from_filename(filename)
    try:
        text = extract_pdf_text(content)
    except Exception:
        text = ""
    return title, pdf_text_to_blocks(title, text)


async def create_linked_report_from_pdf(
    mongo_db,
    *,
    owner_id: int,
    reports_folder_id: int,
    workspace_item_id: int,
    filename: str,
    content: bytes,
) -> dict:
    """Create a fillable report linked to an uploaded PDF (visual PDF + detected fields)."""
    from datetime import datetime, timezone

    from mongo import get_next_sequence

    title = _title_from_filename(filename)
    try:
        blocks = analyze_pdf_layout(content)
    except Exception:
        blocks = []
    now = datetime.now(timezone.utc)
    seq_id = await get_next_sequence(mongo_db, "reports")
    doc = {
        "id": seq_id,
        "owner_id": owner_id,
        "title": title,
        "blocks": blocks,
        "workspace_parent_id": reports_folder_id,
        "source_workspace_pdf_id": workspace_item_id,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db["reports"].insert_one(doc)
    await mongo_db["workspace_items"].update_one(
        {"id": workspace_item_id, "owner_id": owner_id},
        {"$set": {"report_id": seq_id}},
    )
    return doc
