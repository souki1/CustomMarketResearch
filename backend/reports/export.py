"""
Report export engine.

- blocks -> DOCX  (docxtpl template + python-docx fine edits)
- DOCX   -> PDF   (LibreOffice headless CLI)
"""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docxtpl import DocxTemplate

_DIR = Path(__file__).resolve().parent
TEMPLATE_PATH = _DIR / "templates" / "report_template.docx"
GENERATED_DIR = _DIR / "generated"

GENERATED_DIR.mkdir(parents=True, exist_ok=True)

_ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
}

_CALLOUT_COLORS: dict[str, RGBColor] = {
    "amber": RGBColor(0xB4, 0x5B, 0x09),
    "blue": RGBColor(0x1D, 0x4E, 0xD8),
    "emerald": RGBColor(0x04, 0x7A, 0x57),
    "slate": RGBColor(0x47, 0x55, 0x69),
}

_CALLOUT_BG: dict[str, str] = {
    "amber": "FFF7ED",
    "blue": "EFF6FF",
    "emerald": "ECFDF5",
    "slate": "F8FAFC",
}


def _ensure_template() -> Path:
    if TEMPLATE_PATH.exists():
        return TEMPLATE_PATH
    from reports.create_template import build_template
    return build_template()


def _align(block: dict[str, Any]) -> int:
    return _ALIGN_MAP.get(block.get("align", "left"), WD_ALIGN_PARAGRAPH.LEFT)


def _set_paragraph_shading(paragraph, hex_color: str) -> None:
    """Apply background shading to a paragraph via XML."""
    shading_elm = paragraph._element.makeelement(
        qn("w:shd"),
        {
            qn("w:val"): "clear",
            qn("w:color"): "auto",
            qn("w:fill"): hex_color,
        },
    )
    pPr = paragraph._element.get_or_add_pPr()
    pPr.append(shading_elm)


def _add_block(doc: Document, block: dict[str, Any]) -> None:
    """Append one report block to the document using python-docx."""
    btype = block.get("type", "paragraph")
    align = _align(block)

    if btype == "title":
        p = doc.add_paragraph()
        p.alignment = align
        run = p.add_run(block.get("text", ""))
        run.font.size = Pt(24)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    elif btype == "heading":
        h = doc.add_heading(block.get("text", ""), level=1)
        h.alignment = align

    elif btype == "subheading":
        h = doc.add_heading(block.get("text", ""), level=2)
        h.alignment = align

    elif btype == "paragraph":
        p = doc.add_paragraph(block.get("text", ""))
        p.alignment = align

    elif btype == "bullets":
        for item in block.get("items", []):
            p = doc.add_paragraph(item, style="List Bullet")
            p.alignment = align

    elif btype == "numbered":
        for item in block.get("items", []):
            p = doc.add_paragraph(item, style="List Number")
            p.alignment = align

    elif btype == "divider":
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        style = block.get("style", "solid")
        run = p.add_run("— " * 20 if style == "dashed" else "─" * 50)
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

    elif btype == "callout":
        tone = block.get("tone", "amber")
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.left_indent = Inches(0.3)
        p.paragraph_format.right_indent = Inches(0.3)
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(6)
        _set_paragraph_shading(p, _CALLOUT_BG.get(tone, "FFF7ED"))
        run = p.add_run(block.get("text", ""))
        run.font.color.rgb = _CALLOUT_COLORS.get(tone, _CALLOUT_COLORS["amber"])
        run.font.size = Pt(10)

    elif btype == "quote":
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.left_indent = Inches(0.5)
        p.style = doc.styles["Quote"] if "Quote" in [s.name for s in doc.styles] else doc.styles["Normal"]
        run = p.add_run(block.get("text", ""))
        run.font.italic = True
        run.font.color.rgb = RGBColor(0x64, 0x64, 0x64)

    elif btype == "spacer":
        doc.add_paragraph("")

    elif btype == "image":
        src = block.get("src", "")
        caption = block.get("caption", "") or block.get("alt", "")
        if src and Path(src).exists():
            doc.add_picture(src, width=Inches(4.5))
        if caption:
            p = doc.add_paragraph(caption)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.runs[0].font.size = Pt(9)
            p.runs[0].font.italic = True
            p.runs[0].font.color.rgb = RGBColor(0x88, 0x88, 0x88)

    elif btype == "metric":
        p = doc.add_paragraph()
        p.alignment = align
        label_run = p.add_run(f"{block.get('label', 'Metric')}: ")
        label_run.font.size = Pt(11)
        label_run.font.bold = True
        label_run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
        value_run = p.add_run(block.get("value", "—"))
        value_run.font.size = Pt(14)
        value_run.font.bold = True
        value_run.font.color.rgb = RGBColor(0x6D, 0x28, 0xD9)

    elif btype == "code":
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.left_indent = Inches(0.2)
        _set_paragraph_shading(p, "F4F4F5")
        run = p.add_run(block.get("text", ""))
        run.font.name = "Consolas"
        run.font.size = Pt(9)
        run.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    elif btype == "table":
        rows_data: list[list[str]] = block.get("rows", [])
        if not rows_data:
            return
        show_header = block.get("showHeader", True)
        n_cols = max(len(r) for r in rows_data) if rows_data else 1
        n_rows = len(rows_data)

        table = doc.add_table(rows=n_rows, cols=n_cols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.style = "Table Grid"

        for r_idx, row_data in enumerate(rows_data):
            row_cells = table.rows[r_idx].cells
            for c_idx, cell_text in enumerate(row_data):
                if c_idx < n_cols:
                    row_cells[c_idx].text = cell_text

        if show_header and n_rows > 0:
            for cell in table.rows[0].cells:
                for p in cell.paragraphs:
                    for run in p.runs:
                        run.font.bold = True
                        run.font.size = Pt(10)

    else:
        p = doc.add_paragraph(str(block.get("text", "")))
        p.alignment = align


def generate_docx(
    title: str,
    blocks: list[dict[str, Any]],
    report_id: int,
) -> Path:
    """
    Render report blocks into a .docx file.

    1. Load the docxtpl template and render title / date.
    2. Remove the body marker paragraph.
    3. Append each block with python-docx fine edits.
    """
    tpl_path = _ensure_template()
    tpl = DocxTemplate(str(tpl_path))

    now = datetime.now(timezone.utc).strftime("%B %d, %Y")
    tpl.render({"title": title, "generated_date": now, "__body_marker__": ""})

    doc: Document = tpl.docx  # underlying python-docx Document

    # Remove the marker paragraph left by the template
    for para in doc.paragraphs:
        if "__body_marker__" in para.text:
            p_element = para._element
            p_element.getparent().remove(p_element)
            break

    for block in blocks:
        _add_block(doc, block)

    out_path = GENERATED_DIR / f"report_{report_id}.docx"
    doc.save(str(out_path))
    return out_path


def _find_libreoffice() -> str | None:
    """Return the soffice binary path, or None."""
    if shutil.which("soffice"):
        return "soffice"

    candidates: list[str] = []
    if platform.system() == "Windows":
        for base in [
            os.environ.get("PROGRAMFILES", r"C:\Program Files"),
            os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"),
        ]:
            if base:
                candidates.append(os.path.join(base, "LibreOffice", "program", "soffice.exe"))
    elif platform.system() == "Darwin":
        candidates.append("/Applications/LibreOffice.app/Contents/MacOS/soffice")

    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


async def generate_pdf(
    title: str,
    blocks: list[dict[str, Any]],
    report_id: int,
) -> Path:
    """
    Generate PDF by first creating DOCX then converting via LibreOffice.
    """
    soffice = _find_libreoffice()
    if not soffice:
        raise RuntimeError(
            "LibreOffice not found. Install LibreOffice and ensure 'soffice' is on PATH. "
            "Windows: https://www.libreoffice.org/download/ | "
            "Linux: sudo apt install libreoffice-core libreoffice-writer | "
            "macOS: brew install --cask libreoffice"
        )

    docx_path = generate_docx(title, blocks, report_id)

    with tempfile.TemporaryDirectory() as tmp_dir:
        proc = await asyncio.create_subprocess_exec(
            soffice,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", tmp_dir,
            str(docx_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"LibreOffice conversion failed: {stderr.decode(errors='replace')}")

        pdf_name = docx_path.stem + ".pdf"
        tmp_pdf = Path(tmp_dir) / pdf_name

        if not tmp_pdf.exists():
            pdfs = list(Path(tmp_dir).glob("*.pdf"))
            if pdfs:
                tmp_pdf = pdfs[0]
            else:
                raise RuntimeError("LibreOffice produced no PDF output")

        final_path = GENERATED_DIR / f"report_{report_id}.pdf"
        shutil.move(str(tmp_pdf), str(final_path))

    return final_path
