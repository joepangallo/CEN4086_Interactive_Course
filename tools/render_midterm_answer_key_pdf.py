#!/usr/bin/env python3
"""Render the private CEN4086 midterm answer-key HTML as a polished PDF."""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    LongTable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / 'midterm-answer-key.html'
DEFAULT_OUTPUT = ROOT / 'output' / 'pdf' / 'midterm-answer-key.pdf'

INK = colors.HexColor('#1d2433')
MUTED = colors.HexColor('#5c6474')
PRIMARY = colors.HexColor('#3f3d99')
ACCENT = colors.HexColor('#0f8b8d')
LINE = colors.HexColor('#ded9cf')
SOFT = colors.HexColor('#f5f6fb')
WARM = colors.HexColor('#fff2ef')
WARNING = colors.HexColor('#8e342d')


def normalize_pdf_text(value: str) -> str:
    """Use glyphs supported reliably by the PDF fonts and ASCII dash forms."""
    replacements = {
        '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-',
        '\u2212': '-', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
        '\u00a0': ' ', '\u2192': '->', '\u00d7': 'x', '\u2248': 'approximately ',
        '\u2026': '...',
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def safe_markup(tag: Tag) -> str:
    fragment = BeautifulSoup(str(tag), 'html.parser')
    root = fragment.find()
    if root is None:
        return ''
    for code in root.find_all('code'):
        code.name = 'font'
        code.attrs = {'name': 'Courier'}
    for element in root.find_all(['span']):
        element.unwrap()
    for element in root.find_all(True):
        if element.name not in {'p', 'strong', 'b', 'em', 'i', 'font', 'a', 'br', 'sub', 'sup'}:
            element.unwrap()
        elif element.name == 'a':
            href = element.get('href')
            element.attrs = {'href': href} if href else {}
    return normalize_pdf_text(root.decode_contents())


def plain_cell_markup(tag: Tag) -> str:
    text = normalize_pdf_text(tag.get_text(' ', strip=True))
    return html.escape(re.sub(r'\s+', ' ', text))


def make_styles():
    sample = getSampleStyleSheet()
    return {
        'CoverBadge': ParagraphStyle(
            'CoverBadge', parent=sample['BodyText'], fontName='Helvetica-Bold', fontSize=8.5,
            leading=11, textColor=PRIMARY, backColor=colors.white, borderPadding=(4, 7, 4, 7),
            spaceAfter=15, alignment=TA_LEFT,
        ),
        'CoverTitle': ParagraphStyle(
            'CoverTitle', parent=sample['Title'], fontName='Helvetica-Bold', fontSize=27,
            leading=31, textColor=colors.white, alignment=TA_LEFT, spaceAfter=10,
        ),
        'CoverSubtitle': ParagraphStyle(
            'CoverSubtitle', parent=sample['BodyText'], fontName='Helvetica', fontSize=11.5,
            leading=16, textColor=colors.HexColor('#e8e9ff'), spaceAfter=19,
        ),
        'CoverMeta': ParagraphStyle(
            'CoverMeta', parent=sample['BodyText'], fontName='Helvetica-Bold', fontSize=9.3,
            leading=13, textColor=colors.white, alignment=TA_CENTER,
        ),
        'Privacy': ParagraphStyle(
            'Privacy', parent=sample['BodyText'], fontName='Helvetica-Bold', fontSize=10,
            leading=14, textColor=WARNING, spaceAfter=0,
        ),
        'ContentsTitle': ParagraphStyle(
            'ContentsTitle', parent=sample['Heading1'], fontName='Helvetica-Bold', fontSize=23,
            leading=27, textColor=PRIMARY, spaceAfter=18,
        ),
        'PartHeading': ParagraphStyle(
            'PartHeading', parent=sample['Heading1'], fontName='Helvetica-Bold', fontSize=20,
            leading=24, textColor=PRIMARY, spaceBefore=4, spaceAfter=14, keepWithNext=True,
        ),
        'QuestionHeading': ParagraphStyle(
            'QuestionHeading', parent=sample['Heading2'], fontName='Helvetica-Bold', fontSize=15.5,
            leading=19, textColor=INK, borderColor=ACCENT, borderWidth=0,
            borderPadding=(0, 0, 5, 9), leftIndent=0, spaceBefore=13, spaceAfter=8,
            keepWithNext=True,
        ),
        'Subheading': ParagraphStyle(
            'Subheading', parent=sample['Heading3'], fontName='Helvetica-Bold', fontSize=11.7,
            leading=15, textColor=PRIMARY, spaceBefore=10, spaceAfter=5, keepWithNext=True,
        ),
        'Body': ParagraphStyle(
            'Body', parent=sample['BodyText'], fontName='Helvetica', fontSize=9.35,
            leading=13.25, textColor=INK, spaceAfter=7,
        ),
        'List': ParagraphStyle(
            'List', parent=sample['BodyText'], fontName='Helvetica', fontSize=9.2,
            leading=12.7, textColor=INK, spaceAfter=2,
        ),
        'Code': ParagraphStyle(
            'Code', parent=sample['Code'], fontName='Courier', fontSize=7.8,
            leading=10.2, textColor=colors.HexColor('#f7f8fc'), leftIndent=0, rightIndent=0,
        ),
        'TableHeader': ParagraphStyle(
            'TableHeader', parent=sample['BodyText'], fontName='Helvetica-Bold', fontSize=8.3,
            leading=10.5, textColor=colors.white,
        ),
        'TableCell': ParagraphStyle(
            'TableCell', parent=sample['BodyText'], fontName='Helvetica', fontSize=8.2,
            leading=10.6, textColor=INK,
        ),
    }


class AnswerKeyDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            self.leftMargin, self.bottomMargin, self.width, self.height,
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id='answer-key', frames=[frame], onPage=self.draw_page))
        self._bookmark_counter = 0
        self._have_part_heading = False

    def beforeDocument(self):
        super().beforeDocument()
        self._bookmark_counter = 0
        self._have_part_heading = False

    def draw_page(self, canvas, doc):
        canvas.saveState()
        page_width, page_height = self.pagesize
        if doc.page > 1:
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.6)
            canvas.line(self.leftMargin, page_height - 31, page_width - self.rightMargin, page_height - 31)
            canvas.setFillColor(PRIMARY)
            canvas.setFont('Helvetica-Bold', 8)
            canvas.drawString(self.leftMargin, page_height - 24, 'CEN4086 MIDTERM - DETAILED ANSWER KEY')
            canvas.setFillColor(MUTED)
            canvas.setFont('Helvetica', 7.5)
            canvas.drawRightString(page_width - self.rightMargin, page_height - 24, 'PRIVATE INSTRUCTOR MATERIAL')
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(self.leftMargin, 31, page_width - self.rightMargin, 31)
        canvas.setFillColor(MUTED)
        canvas.setFont('Helvetica', 7.5)
        canvas.drawString(self.leftMargin, 20, 'Do not distribute')
        canvas.drawRightString(page_width - self.rightMargin, 20, f'Page {doc.page}')
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        style_name = flowable.style.name
        if style_name == 'PartHeading':
            self._have_part_heading = True
            level = 0
        elif style_name == 'QuestionHeading':
            level = 1 if self._have_part_heading else 0
        else:
            return
        text = flowable.getPlainText()
        self._bookmark_counter += 1
        key = f'heading-{self._bookmark_counter}'
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify('TOCEntry', (level, text, self.page, key))


def column_widths(rows: list[list[str]], total_width: float) -> list[float]:
    count = max(len(row) for row in rows)
    scores = []
    for index in range(count):
        longest = max((len(row[index]) if index < len(row) else 0) for row in rows)
        scores.append(max(9, min(longest, 52)))
    total = sum(scores)
    widths = [total_width * score / total for score in scores]
    minimum = 0.72 * inch
    deficit = sum(max(0, minimum - width) for width in widths)
    widths = [max(minimum, width) for width in widths]
    if deficit:
        widest = max(range(len(widths)), key=widths.__getitem__)
        widths[widest] -= deficit
    return widths


def html_table(tag: Tag, styles, width: float):
    rows_text = []
    rows_flowables = []
    for row_index, tr in enumerate(tag.find_all('tr')):
        cells = tr.find_all(['th', 'td'], recursive=False)
        values = [normalize_pdf_text(cell.get_text(' ', strip=True)) for cell in cells]
        rows_text.append(values)
        cell_style = styles['TableHeader'] if row_index == 0 else styles['TableCell']
        rows_flowables.append([Paragraph(plain_cell_markup(cell), cell_style) for cell in cells])
    widths = column_widths(rows_text, width)
    table = LongTable(rows_flowables, colWidths=widths, repeatRows=1, splitByRow=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#faf9f6')]),
        ('GRID', (0, 0), (-1, -1), 0.45, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def html_list(tag: Tag, styles):
    items = []
    for li in tag.find_all('li', recursive=False):
        content = safe_markup(li)
        items.append(ListItem(Paragraph(content, styles['List']), leftIndent=11))
    ordered = tag.name == 'ol'
    return ListFlowable(
        items, bulletType='1' if ordered else 'bullet', start='1', leftIndent=18,
        bulletFontName='Helvetica', bulletFontSize=8.5, bulletColor=PRIMARY,
        spaceBefore=2, spaceAfter=7,
    )


def article_story(article: Tag, styles, doc_width: float):
    story = []
    seen_part = False
    for child in article.children:
        if isinstance(child, NavigableString) or not isinstance(child, Tag):
            continue
        name = child.name.lower()
        if name == 'h1':
            if seen_part or story:
                story.append(PageBreak())
            seen_part = True
            story.append(Paragraph(safe_markup(child), styles['PartHeading']))
        elif name == 'h2':
            story.append(Paragraph(safe_markup(child), styles['QuestionHeading']))
        elif name == 'h3':
            story.append(Paragraph(safe_markup(child), styles['Subheading']))
        elif name == 'p':
            story.append(Paragraph(safe_markup(child), styles['Body']))
        elif name in {'ul', 'ol'}:
            story.append(html_list(child, styles))
        elif name == 'blockquote':
            quote = Paragraph(safe_markup(child), styles['Privacy'])
            box = Table([[quote]], colWidths=[doc_width], hAlign='LEFT')
            box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), WARM),
                ('BOX', (0, 0), (-1, -1), 0.8, WARNING),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
            ]))
            story.extend([box, Spacer(1, 10)])
        elif name == 'pre':
            pre = Preformatted(normalize_pdf_text(child.get_text()), styles['Code'])
            box = Table([[pre]], colWidths=[doc_width], hAlign='LEFT')
            box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#1e2433')),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.extend([box, Spacer(1, 7)])
        elif name == 'table':
            story.extend([html_table(child, styles, doc_width), Spacer(1, 7)])
    return story


def build_pdf(input_path: Path, output_path: Path):
    soup = BeautifulSoup(input_path.read_text(encoding='utf-8'), 'html.parser')
    article = soup.find('article')
    if article is None:
        raise ValueError('Input HTML does not contain an <article> element')

    output_path.parent.mkdir(parents=True, exist_ok=True)
    styles = make_styles()
    doc = AnswerKeyDocTemplate(
        str(output_path), pagesize=letter,
        leftMargin=0.67 * inch, rightMargin=0.67 * inch,
        topMargin=0.54 * inch, bottomMargin=0.52 * inch,
        title='CEN4086 Midterm - Detailed Private Answer Key',
        author='CEN4086 Instructor',
        subject='Private instructor answer key and scoring guidance',
        creator='CEN4086 answer-key renderer',
    )

    meta = Table([
        [Paragraph('ASSESSMENT<br/><b>100 base + 3 bonus</b>', styles['CoverMeta']),
         Paragraph('COVERAGE<br/><b>Core course topics</b>', styles['CoverMeta']),
         Paragraph('STUDENT URL<br/><b>/midterm</b>', styles['CoverMeta'])]
    ], colWidths=[doc.width / 3] * 3)
    meta.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.6, colors.HexColor('#7775c9')),
        ('INNERGRID', (0, 0), (-1, -1), 0.6, colors.HexColor('#7775c9')),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#35347f')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    cover = Table([[[
        Paragraph('PRIVATE INSTRUCTOR MATERIAL', styles['CoverBadge']),
        Paragraph('CEN4086 Midterm<br/>Detailed Answer Key', styles['CoverTitle']),
        Paragraph(
            'Model responses, full calculations, scoring guidance, and explanations for '
            '15 regular and 3 bonus multiple-choice items.', styles['CoverSubtitle']),
        meta,
    ]]], colWidths=[doc.width])
    cover.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PRIMARY),
        ('LEFTPADDING', (0, 0), (-1, -1), 28),
        ('RIGHTPADDING', (0, 0), (-1, -1), 28),
        ('TOPPADDING', (0, 0), (-1, -1), 25),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 25),
    ]))
    privacy = Table([[
        Paragraph(
            'PRIVATE INSTRUCTOR MATERIAL - Keep this answer key outside the public course '
            'repository and quiz directory.', styles['Privacy'])
    ]], colWidths=[doc.width])
    privacy.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WARM),
        ('BOX', (0, 0), (-1, -1), 0.8, WARNING),
        ('LEFTPADDING', (0, 0), (-1, -1), 11),
        ('RIGHTPADDING', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle('TOCPart', fontName='Helvetica-Bold', fontSize=10.5, leading=14,
                       leftIndent=0, firstLineIndent=0, textColor=PRIMARY, spaceBefore=5),
        ParagraphStyle('TOCQuestion', fontName='Helvetica', fontSize=8.8, leading=11.5,
                       leftIndent=16, firstLineIndent=0, textColor=INK, spaceBefore=1),
    ]

    story = [
        cover, Spacer(1, 18), privacy, Spacer(1, 13),
        Paragraph(
            'This document matches the student exam at <font name="Courier">/midterm</font>. '
            'It covers 100 base points plus up to 3 bonus points. Model answers show the '
            'substance required for full credit; students do not need to reproduce the wording.',
            styles['Body']),
        PageBreak(),
        Paragraph('Contents', styles['ContentsTitle']),
        toc,
        PageBreak(),
    ]
    story.extend(article_story(article, styles, doc.width))
    doc.multiBuild(story)
    print(f'Wrote {output_path} ({output_path.stat().st_size} bytes)')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', nargs='?', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('output', nargs='?', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build_pdf(args.input.resolve(), args.output.resolve())


if __name__ == '__main__':
    main()
