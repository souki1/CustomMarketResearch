"""Import Word (.docx) files into editable report blocks."""

from __future__ import annotations

import uuid
from io import BytesIO
from typing import Any, Iterator

from docx import Document
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


def _new_block_id() -> str:
    return str(uuid.uuid4())


def _title_from_filename(filename: str) -> str:
    base = filename
    for ext in (".docx", ".doc"):
        if base.lower().endswith(ext):
            base = base[: -len(ext)]
            break
    base = base.replace("_", " ").replace("-", " ").strip()
    return base or "Untitled document"


def _iter_body_blocks(doc: Document) -> Iterator[Paragraph | Table]:
    for child in doc.element.body:
        if isinstance(child, CT_P):
            yield Paragraph(child, doc)
        elif isinstance(child, CT_Tbl):
            yield Table(child, doc)


def _paragraph_block(para: Paragraph) -> dict[str, Any] | None:
    text = (para.text or "").strip()
    style_name = (para.style.name if para.style else "") or ""
    style_lower = style_name.lower()

    if not text:
        return {"id": _new_block_id(), "type": "spacer", "size": "sm"}

    if "list bullet" in style_lower:
        return {"id": _new_block_id(), "type": "bullets", "items": [text], "align": "left"}
    if "list number" in style_lower:
        return {"id": _new_block_id(), "type": "numbered", "items": [text], "align": "left"}

    if style_name == "Title" or "title" in style_lower:
        return {"id": _new_block_id(), "type": "title", "text": text, "align": "left"}
    if style_name == "Heading 1" or style_lower.startswith("heading 1"):
        return {"id": _new_block_id(), "type": "heading", "text": text, "align": "left"}
    if style_name == "Heading 2" or style_lower.startswith("heading 2"):
        return {"id": _new_block_id(), "type": "subheading", "text": text, "align": "left"}
    if "heading" in style_lower:
        return {"id": _new_block_id(), "type": "heading", "text": text, "align": "left"}
    if "quote" in style_lower:
        return {"id": _new_block_id(), "type": "quote", "text": text, "align": "left"}

    return {"id": _new_block_id(), "type": "paragraph", "text": text, "align": "left"}


def _merge_list_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for block in blocks:
        if block.get("type") in ("bullets", "numbered") and out:
            prev = out[-1]
            if prev.get("type") == block.get("type"):
                prev_items = list(prev.get("items") or [])
                prev_items.extend(list(block.get("items") or []))
                out[-1] = {**prev, "items": prev_items[:80]}
                continue
        out.append(block)
    return out


def _table_block(table: Table) -> dict[str, Any]:
    rows: list[list[str]] = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        if any(cells):
            rows.append(cells)
    if not rows:
        rows = [["", ""]]
    return {
        "id": _new_block_id(),
        "type": "table",
        "showHeader": True,
        "rows": rows,
        "align": "left",
    }


def docx_to_blocks(content: bytes) -> list[dict[str, Any]]:
    """Parse a .docx file into report blocks (paragraph order preserved)."""
    doc = Document(BytesIO(content))
    raw: list[dict[str, Any]] = []
    for item in _iter_body_blocks(doc):
        if isinstance(item, Paragraph):
            block = _paragraph_block(item)
            if block:
                raw.append(block)
        elif isinstance(item, Table):
            raw.append(_table_block(item))

    merged = _merge_list_blocks(raw)
    # Drop leading spacers
    while merged and merged[0].get("type") == "spacer":
        merged.pop(0)
    if not merged:
        merged = [
            {"id": _new_block_id(), "type": "title", "text": "", "align": "left"},
            {"id": _new_block_id(), "type": "paragraph", "text": "", "align": "left"},
        ]
    return merged[:500]


def build_report_from_docx(filename: str, content: bytes) -> tuple[str, list[dict]]:
    title = _title_from_filename(filename)
    try:
        blocks = docx_to_blocks(content)
    except Exception:
        blocks = [
            {"id": _new_block_id(), "type": "title", "text": title, "align": "left"},
            {"id": _new_block_id(), "type": "paragraph", "text": "", "align": "left"},
        ]
    # Use first title block text as report title when present
    for block in blocks:
        if block.get("type") == "title" and str(block.get("text", "")).strip():
            title = str(block["text"]).strip()[:500]
            break
    return title, blocks


async def create_linked_report_from_docx(
    mongo_db,
    *,
    owner_id: int,
    reports_folder_id: int,
    workspace_item_id: int,
    filename: str,
    content: bytes,
) -> dict:
    """Create an editable report from a .docx file and link it to the workspace item."""
    from datetime import datetime, timezone

    from mongo import get_next_sequence

    title, blocks = build_report_from_docx(filename, content)
    now = datetime.now(timezone.utc)
    seq_id = await get_next_sequence(mongo_db, "reports")
    doc = {
        "id": seq_id,
        "owner_id": owner_id,
        "title": title,
        "blocks": blocks,
        "workspace_parent_id": reports_folder_id,
        "source_workspace_file_id": workspace_item_id,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db["reports"].insert_one(doc)
    await mongo_db["workspace_items"].update_one(
        {"id": workspace_item_id, "owner_id": owner_id},
        {"$set": {"report_id": seq_id}},
    )
    return doc
