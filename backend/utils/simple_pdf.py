"""Small dependency-free PDF writer used by the fallback RFP endpoint."""

from __future__ import annotations

import textwrap
from typing import Iterable

PAGE_WIDTH = 595
PAGE_HEIGHT = 842
LEFT = 48
TOP = 800
LINE_HEIGHT = 15
MAX_LINES_PER_PAGE = 50
WRAP_WIDTH = 92


def _escape_pdf_text(text: str) -> str:
    return (
        str(text)
        .replace('\\', '\\\\')
        .replace('(', '\\(')
        .replace(')', '\\)')
        .replace('\u20b9', 'INR ')
        .replace('₹', 'INR ')
        .replace('–', '-')
        .replace('—', '-')
        .replace('’', "'")
        .replace('“', '"')
        .replace('”', '"')
    )


def _wrap_lines(lines: Iterable[str]) -> list[str]:
    wrapped: list[str] = []
    for line in lines:
        raw = str(line or '').rstrip()
        if not raw:
            wrapped.append('')
            continue
        wrapped.extend(textwrap.wrap(raw, width=WRAP_WIDTH) or [''])
    return wrapped


def build_pdf(lines: Iterable[str], title: str = 'RFP Document') -> bytes:
    wrapped = _wrap_lines(lines)
    pages = [wrapped[i:i + MAX_LINES_PER_PAGE] for i in range(0, len(wrapped), MAX_LINES_PER_PAGE)] or [[title]]
    objects: list[bytes] = []

    def add_obj(content: str | bytes) -> int:
        content_bytes = content.encode('latin-1', errors='replace') if isinstance(content, str) else content
        objects.append(content_bytes)
        return len(objects)

    add_obj('<< /Type /Catalog /Pages 2 0 R >>')
    add_obj(b'')
    add_obj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    page_obj_nums: list[int] = []
    for page_lines in pages:
        commands = ['BT', '/F1 10.5 Tf', f'{LEFT} {TOP} Td']
        for index, line in enumerate(page_lines):
            if index:
                commands.append(f'0 -{LINE_HEIGHT} Td')
            commands.append(f'({_escape_pdf_text(line)}) Tj')
        commands.append('ET')
        stream = '\n'.join(commands).encode('latin-1', errors='replace')
        contents_num = add_obj(b'<< /Length ' + str(len(stream)).encode('ascii') + b' >>\nstream\n' + stream + b'\nendstream')
        page_num = add_obj(
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] '
            f'/Resources << /Font << /F1 3 0 R >> >> /Contents {contents_num} 0 R >>'
        )
        page_obj_nums.append(page_num)

    kids = ' '.join(f'{num} 0 R' for num in page_obj_nums)
    objects[1] = f'<< /Type /Pages /Kids [{kids}] /Count {len(page_obj_nums)} >>'.encode('latin-1')

    pdf = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for obj_num, content in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f'{obj_num} 0 obj\n'.encode('ascii'))
        pdf.extend(content)
        pdf.extend(b'\nendobj\n')

    xref_start = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode('ascii'))
    pdf.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode('ascii'))
    pdf.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF'.encode('ascii'))
    return bytes(pdf)
