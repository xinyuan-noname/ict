#!/usr/bin/env python3
"""Build the Chinese completion-report DOCX from the Markdown template."""

from __future__ import annotations

import os
import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "completion-report-template.md"
OUTPUT = Path(os.environ.get("REPORT_OUTPUT", str(ROOT / "docs" / "项目完成报告-闪队-已填写.docx")))

BODY_FONT = "宋体"
HEAD_FONT = "微软雅黑"
CODE_FONT = "Consolas"
INK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x6B, 0x72, 0x80)
BRAND = RGBColor(0x0B, 0x5C, 0x8A)
LIGHT = "F2F5F8"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_run_font(run, font: str, size: float | None = None, bold: bool | None = None) -> None:
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    run.font.color.rgb = INK


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    field_begin = OxmlElement("w:fldChar")
    field_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    field_sep = OxmlElement("w:fldChar")
    field_sep.set(qn("w:fldCharType"), "separate")
    field_end = OxmlElement("w:fldChar")
    field_end.set(qn("w:fldCharType"), "end")
    run._r.append(field_begin)
    run._r.append(instr)
    run._r.append(field_sep)
    run._r.append(field_end)
    set_run_font(run, BODY_FONT, 9)


def add_inline(paragraph, text: str) -> None:
    parts = re.split(r"(\*\*.*?\*\*|`.*?`)", text)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            run.bold = True
            set_run_font(run, BODY_FONT, 10.5)
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, CODE_FONT, 9)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, BODY_FONT, 10.5)


def add_heading(document: Document, text: str, level: int) -> None:
    paragraph = document.add_paragraph()
    paragraph.style = document.styles[f"Heading {level}"]
    paragraph.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    paragraph.paragraph_format.space_after = Pt(6)
    run = paragraph.add_run(text)
    set_run_font(run, HEAD_FONT, {1: 16, 2: 13, 3: 11.5}.get(level, 11), True)
    run.font.color.rgb = BRAND if level <= 2 else INK


def add_table(document: Document, rows: list[list[str]]) -> None:
    if not rows:
        return
    cols = max(len(row) for row in rows)
    table = document.add_table(rows=len(rows), cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for r_index, row in enumerate(rows):
        for c_index in range(cols):
            cell = table.cell(r_index, c_index)
            cell.text = ""
            p = cell.paragraphs[0]
            value = row[c_index] if c_index < len(row) else ""
            add_inline(p, value)
            p.paragraph_format.space_after = Pt(2)
            if r_index == 0:
                set_cell_shading(cell, LIGHT)
                for run in p.runs:
                    run.bold = True
    document.add_paragraph().paragraph_format.space_after = Pt(0)


def parse_markdown(document: Document, lines: list[str]) -> None:
    index = 0
    while index < len(lines):
        raw = lines[index].rstrip()
        line = raw.strip()
        if not line or line == "---":
            index += 1
            continue
        if line.startswith("```"):
            index += 1
            code: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            paragraph = document.add_paragraph()
            paragraph.style = document.styles["No Spacing"]
            paragraph.paragraph_format.left_indent = Cm(0.4)
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.space_after = Pt(4)
            paragraph.paragraph_format.line_spacing = 1.05
            for code_line in code:
                if paragraph.text:
                    paragraph.add_run("\n")
                run = paragraph.add_run(code_line)
                set_run_font(run, CODE_FONT, 8.5)
            p_pr = paragraph._p.get_or_add_pPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:fill"), "F7F8FA")
            p_pr.append(shd)
            continue
        if line.startswith("|"):
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                row = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in row):
                    rows.append(row)
                index += 1
            add_table(document, rows)
            continue
        if line.startswith("## "):
            add_heading(document, line[3:], 1)
            index += 1
            continue
        if line.startswith("### "):
            add_heading(document, line[4:], 2)
            index += 1
            continue
        if line.startswith("#### "):
            add_heading(document, line[5:], 3)
            index += 1
            continue
        if line.startswith("# "):
            add_heading(document, line[2:], 1)
            index += 1
            continue
        if line.startswith(">"):
            text = line.lstrip("> ").strip()
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.3)
            paragraph.paragraph_format.space_after = Pt(3)
            add_inline(paragraph, text)
            for run in paragraph.runs:
                run.font.color.rgb = MUTED
                run.italic = True
            index += 1
            continue
        if line.startswith("- [ ] "):
            paragraph = document.add_paragraph(style="List Bullet")
            add_inline(paragraph, "☐ " + line[6:])
            index += 1
            continue
        if line.startswith("- "):
            paragraph = document.add_paragraph(style="List Bullet")
            add_inline(paragraph, line[2:])
            index += 1
            continue
        if re.match(r"^\d+\.\s", line):
            paragraph = document.add_paragraph(style="List Number")
            add_inline(paragraph, re.sub(r"^\d+\.\s+", "", line))
            index += 1
            continue
        paragraph = document.add_paragraph()
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.line_spacing = 1.5
        add_inline(paragraph, line)
        index += 1


def build() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    lines = text.splitlines()

    document = Document()
    section = document.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.4)
    section.bottom_margin = Cm(2.2)
    section.left_margin = Cm(2.6)
    section.right_margin = Cm(2.4)

    normal = document.styles["Normal"]
    normal.font.name = BODY_FONT
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header_run = header.add_run("华为 ICT 大赛 · Track 1 · 项目完成报告")
    set_run_font(header_run, BODY_FONT, 8.5)
    header_run.font.color.rgb = MUTED
    add_page_number(section.footer.paragraphs[0])

    # Cover
    for _ in range(3):
        document.add_paragraph()
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("华为 ICT 大赛 · Track 1")
    set_run_font(run, HEAD_FONT, 12, False)
    run.font.color.rgb = BRAND

    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(18)
    run = p.add_run("项目完成报告")
    set_run_font(run, HEAD_FONT, 30, True)
    run.font.color.rgb = BRAND

    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(10)
    run = p.add_run("check · 每日健康清单")
    set_run_font(run, HEAD_FONT, 17, True)

    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("生活服务 / 健康管理")
    set_run_font(run, BODY_FONT, 11)
    run.font.color.rgb = MUTED

    document.add_paragraph()
    cover_rows = [
        ["作品名称", "check · 每日健康清单"],
        ["参赛方向", "生活服务 / 健康管理"],
        ["队伍名称", "闪队"],
        ["团队成员", "陈皓庭、白德布鑫、潘振宇"],
        ["学校 / 学院", "天津工业大学"],
        ["指导教师", "李杰"],
        ["队长联系电话", "18708477617"],
        ["队长联系邮箱", "3236256044@qq.com"],
        ["提交日期", "[请填写]"],
    ]
    table = document.add_table(rows=len(cover_rows), cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.columns[0].width = Cm(4.2)
    table.columns[1].width = Cm(10.5)
    for r_index, row in enumerate(cover_rows):
        for c_index, value in enumerate(row):
            cell = table.cell(r_index, c_index)
            cell.text = ""
            p = cell.paragraphs[0]
            add_inline(p, value)
            if c_index == 0:
                set_cell_shading(cell, LIGHT)
                for run in p.runs:
                    run.bold = True

    document.add_paragraph()
    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("本报告模板基于当前仓库实际实现整理；提交前请补充方括号信息。")
    set_run_font(run, BODY_FONT, 9)
    run.font.color.rgb = MUTED

    document.add_page_break()

    start = next(i for i, line in enumerate(lines) if line.strip() == "## 摘要")
    parse_markdown(document, lines[start:])

    # Highlight team names in section 9.
    for paragraph in document.paragraphs:
        if "陈皓庭" in paragraph.text or "白德布鑫" in paragraph.text or "潘振宇" in paragraph.text:
            for run in paragraph.runs:
                if any(name in run.text for name in ("陈皓庭", "白德布鑫", "潘振宇")):
                    run.bold = True

    document.save(OUTPUT)
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    build()
