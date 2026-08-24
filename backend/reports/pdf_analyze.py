"""Analyze PDF layout: text lines, labels, and box/field regions with screen coordinates."""

from __future__ import annotations

import re
import uuid
from io import BytesIO
from typing import Any

# US Letter canvas in Report Studio (96 DPI)
SCREEN_W = 816
SCREEN_H = 1056


def _new_block_id() -> str:
    return str(uuid.uuid4())


def _scale(page_w: float, page_h: float) -> tuple[float, float]:
    if page_w <= 0 or page_h <= 0:
        return 1.0, 1.0
    return SCREEN_W / page_w, SCREEN_H / page_h


def _to_screen(
    x: float, y: float, w: float, h: float, sx: float, sy: float
) -> tuple[int, int, int, int]:
    return (
        max(0, round(x * sx)),
        max(0, round(y * sy)),
        max(40, round(w * sx)),
        max(18, round(h * sy)),
    )


def _group_words_into_lines(words: list[dict], y_tol: float = 4.0) -> list[list[dict]]:
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
    lines: list[list[dict]] = []
    current: list[dict] = []
    current_top: float | None = None
    for w in sorted_words:
        top = float(w["top"])
        if current_top is None or abs(top - current_top) <= y_tol:
            current.append(w)
            current_top = top if current_top is None else (current_top + top) / 2
        else:
            if current:
                lines.append(sorted(current, key=lambda x: x["x0"]))
            current = [w]
            current_top = top
    if current:
        lines.append(sorted(current, key=lambda x: x["x0"]))
    return lines


def _line_bbox(line: list[dict]) -> tuple[float, float, float, float]:
    x0 = min(w["x0"] for w in line)
    x1 = max(w["x1"] for w in line)
    top = min(w["top"] for w in line)
    bottom = max(w["bottom"] for w in line)
    return x0, top, x1 - x0, bottom - top


def _merge_lines_to_blocks(
    lines: list[list[dict]], line_gap: float = 14.0
) -> list[tuple[str, float, float, float, float]]:
    """Return (text, x, y, w, h) paragraphs from word lines."""
    if not lines:
        return []
    out: list[tuple[str, float, float, float, float]] = []
    chunk_lines: list[list[dict]] = []
    chunk_bottom = 0.0

    def flush() -> None:
        if not chunk_lines:
            return
        texts: list[str] = []
        x0 = min(w["x0"] for ln in chunk_lines for w in ln)
        x1 = max(w["x1"] for ln in chunk_lines for w in ln)
        top = min(w["top"] for ln in chunk_lines for w in ln)
        bottom = max(w["bottom"] for ln in chunk_lines for w in ln)
        for ln in chunk_lines:
            texts.append(" ".join(str(w["text"]) for w in ln))
        text = "\n".join(t for t in texts if t.strip()).strip()
        if text:
            out.append((text, x0, top, x1 - x0, bottom - top))
        chunk_lines.clear()

    for ln in lines:
        _, top, _, h = _line_bbox(ln)
        if chunk_lines and top - chunk_bottom > line_gap:
            flush()
        chunk_lines.append(ln)
        chunk_bottom = top + h
    flush()
    return out


def _looks_like_field_rect(w: float, h: float, page_h: float) -> bool:
    if w < 24 or h < 8:
        return False
    if h > page_h * 0.25:
        return False
    aspect = w / max(h, 1)
    return aspect >= 1.2 and w >= 40


def _rect_overlaps(
    ax: float, ay: float, aw: float, ah: float,
    bx: float, by: float, bw: float, bh: float,
    margin: float = 4.0,
) -> bool:
    return not (
        ax + aw + margin < bx
        or bx + bw + margin < ax
        or ay + ah + margin < by
        or by + bh + margin < ay
    )


def _extract_acroform_fields(content: bytes) -> list[dict[str, Any]]:
    try:
        from pypdf import PdfReader
    except ImportError:
        return []

    reader = PdfReader(BytesIO(content))
    fields = reader.get_fields() or {}
    out: list[dict[str, Any]] = []
    for name, field in fields.items():
        if not field:
            continue
        ft = field.get("/FT")
        val = field.get("/V")
        text = ""
        if val is not None:
            text = str(val).strip()
        rect = field.get("/Rect")
        page_idx = 0
        if not rect or len(rect) < 4:
            continue
        # PDF rect: x0, y0, x1, y1 (origin bottom-left) — convert later per page height
        out.append(
            {
                "name": str(name),
                "field_type": str(ft) if ft else "Tx",
                "text": text,
                "rect_pdf": [float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])],
                "page": page_idx,
            }
        )
    return out


def analyze_pdf_layout(content: bytes, *, max_pages: int = 20) -> list[dict]:
    """
    Detect editable regions on each PDF page.
    Returns report blocks with pdf_overlay + screen coordinates.
    """
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("PDF layout analysis requires pdfplumber on the server") from exc

    blocks: list[dict] = []
    text_regions: list[tuple[int, float, float, float, float]] = []

    with pdfplumber.open(BytesIO(content)) as pdf:
        for page_idx, page in enumerate(pdf.pages[:max_pages]):
            pw = float(page.width or 612)
            ph = float(page.height or 792)
            sx, sy = _scale(pw, ph)

            words = page.extract_words(
                keep_blank_chars=False,
                use_text_flow=True,
                extra_attrs=["size"],
            )
            lines = _group_words_into_lines(words)
            paragraphs = _merge_lines_to_blocks(lines)

            for text, x, y, w, h in paragraphs:
                px, py, pw_s, ph_s = _to_screen(x, y, w, h, sx, sy)
                text_regions.append((page_idx, x, y, w, h))
                is_label = len(text) < 60 and text.rstrip().endswith(":")
                block_type = "paragraph"
                role = "label" if is_label else "text"
                blocks.append(
                    {
                        "id": _new_block_id(),
                        "type": block_type,
                        "text": text,
                        "align": "left",
                        "pdf_overlay": True,
                        "pdf_auto": True,
                        "pdf_role": role,
                        "pdf_page": page_idx,
                        "pdf_x": px,
                        "pdf_y": py,
                        "pdf_width": pw_s,
                        "pdf_height": max(ph_s, 22),
                    }
                )

            # Drawn rectangles that look like empty input boxes
            for rect in page.rects or []:
                x = float(rect.get("x0", 0))
                y = float(rect.get("top", 0))
                w = float(rect.get("width", 0))
                h = float(rect.get("height", 0))
                if not _looks_like_field_rect(w, h, ph):
                    continue
                if any(
                    _rect_overlaps(x, y, w, h, tx, ty, tw, th)
                    for pi, tx, ty, tw, th in text_regions
                    if pi == page_idx
                ):
                    # skip if mostly covered by extracted text
                    continue
                px, py, pw_s, ph_s = _to_screen(x, y, w, h, sx, sy)
                blocks.append(
                    {
                        "id": _new_block_id(),
                        "type": "callout",
                        "text": "",
                        "align": "left",
                        "tone": "slate",
                        "pdf_overlay": True,
                        "pdf_auto": True,
                        "pdf_role": "field",
                        "pdf_page": page_idx,
                        "pdf_x": px,
                        "pdf_y": py,
                        "pdf_width": pw_s,
                        "pdf_height": ph_s,
                    }
                )

            # Underline-style fields (common on forms)
            for line in page.lines or []:
                x0 = float(line.get("x0", 0))
                x1 = float(line.get("x1", 0))
                y = float(line.get("top", 0))
                w = abs(x1 - x0)
                h = 14.0
                if w < 48:
                    continue
                if not _looks_like_field_rect(w, h, ph):
                    continue
                field_y = max(0.0, y - h + 2)
                if any(
                    _rect_overlaps(x0, field_y, w, h, tx, ty, tw, th)
                    for pi, tx, ty, tw, th in text_regions
                    if pi == page_idx
                ):
                    continue
                px, py, pw_s, ph_s = _to_screen(x0, field_y, w, h, sx, sy)
                blocks.append(
                    {
                        "id": _new_block_id(),
                        "type": "callout",
                        "text": "",
                        "align": "left",
                        "tone": "slate",
                        "pdf_overlay": True,
                        "pdf_auto": True,
                        "pdf_role": "field",
                        "pdf_page": page_idx,
                        "pdf_x": px,
                        "pdf_y": py,
                        "pdf_width": pw_s,
                        "pdf_height": ph_s,
                    }
                )

    # AcroForm fields (native PDF form widgets)
    for af in _extract_acroform_fields(content):
        page_idx = int(af.get("page") or 0)
        rect = af["rect_pdf"]
        # pypdf uses bottom-left origin; pdfplumber uses top-left — approximate with letter height
        page_h_pts = 792.0
        x0, y0, x1, y1 = rect
        x = x0
        y = page_h_pts - y1
        w = x1 - x0
        h = y1 - y0
        sx, sy = _scale(612.0, page_h_pts)
        px, py, pw_s, ph_s = _to_screen(x, y, w, h, sx, sy)
        name = str(af.get("name", ""))
        label = re.sub(r"[_\.\[\]]+", " ", name).strip().title()
        blocks.append(
            {
                "id": _new_block_id(),
                "type": "callout",
                "text": str(af.get("text") or ""),
                "align": "left",
                "tone": "slate",
                "pdf_overlay": True,
                "pdf_auto": True,
                "pdf_role": "field",
                "pdf_page": page_idx,
                "pdf_x": px,
                "pdf_y": py,
                "pdf_width": pw_s,
                "pdf_height": max(ph_s, 24),
                "pdf_field_name": label or None,
            }
        )

    # Cap total blocks for performance
    return blocks[:400]
