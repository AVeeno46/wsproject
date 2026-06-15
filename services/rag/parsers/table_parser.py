import re
from html import unescape
from html.parser import HTMLParser


class _HtmlTableMarkdownParser(HTMLParser):
    """작은 HTML table -> Markdown 변환용 parser.

    outer table의 tr/td/th만 행/열로 보고, nested table은 현재 셀의 텍스트로
    flatten한다. rowspan/colspan은 완벽히 복원하지 않고 셀 텍스트 순서만 유지한다.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.table_depth = 0
        self.in_row = False
        self.current_row = None
        self.current_cell = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "table":
            self.table_depth += 1
            return

        if self.table_depth != 1:
            return

        if tag == "tr":
            self.in_row = True
            self.current_row = []
        elif tag in {"td", "th"} and self.in_row:
            self.current_cell = []
        elif tag == "br" and self.current_cell is not None:
            self.current_cell.append(" ")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "table":
            if self.table_depth > 0:
                self.table_depth -= 1
            return

        if self.table_depth != 1:
            return

        if tag in {"td", "th"} and self.current_cell is not None:
            text = " ".join("".join(self.current_cell).split())
            self.current_row.append(text)
            self.current_cell = None
        elif tag == "tr" and self.in_row:
            if self.current_row:
                self.rows.append(self.current_row)
            self.current_row = None
            self.in_row = False

    def handle_data(self, data):
        if self.table_depth >= 1 and self.current_cell is not None:
            self.current_cell.append(data)


class TableParser:
    """PDF/HWPX에서 나온 표 데이터를 공통 형식으로 정리하는 클래스.

    이 클래스는 Upstage API를 직접 호출하지 않는다. PdfParser 또는 HwpxParser가
    이미 추출한 table element를 넘기면, 여기서는 Markdown 추출/정규화/깨짐
    판별만 담당한다.
    """

    def to_markdown(self, element: dict) -> str:
        """table element에서 Markdown/HTML/Text 후보를 찾아 Markdown 문자열로 반환한다."""
        markdown = element.get("markdown") or element.get("html") or ""

        content = element.get("content")
        if not markdown and isinstance(content, dict):  #아직 markdown 값을 못 찾았고,content가 딕셔너리라면
            markdown = (
                content.get("markdown")
                or content.get("html")
                or content.get("text")
                or ""
            )

        return self.normalize(markdown)

    def normalize(self, table_text: str) -> str:
        """표 Markdown을 후처리한다.

        지금은 비어 있는 셀(`||`, `|   |`)을 `[빈칸]`으로 채우는 정도만 한다.
        나중에 병합 셀 보정, 헤더 정리, 행/열 수 검증을 추가하기 좋은 위치다.
        """
        if not table_text:
            return ""

        while re.search(r"\|\s*\|", table_text):
            table_text = re.sub(r"\|\s*\|", "| [빈칸] |", table_text)

        return table_text.strip()

    def html_to_markdown(self, html: str) -> str:
        """HTML table을 사람이 확인하기 쉬운 Markdown table로 변환한다.

        변환 실패, table 없음, 구조 불명확 상황에서는 빈 문자열을 반환한다.
        raw_table은 따로 보존되므로 여기서는 완벽한 복원보다 안전한 preview를 우선한다.
        """
        if not html or "<table" not in html.lower():
            return ""

        try:
            parser = _HtmlTableMarkdownParser()
            parser.feed(html)
            rows = [
                [self._escape_markdown_cell(cell) for cell in row]
                for row in parser.rows
                if any(str(cell).strip() for cell in row)
            ]
            if not rows:
                return ""

            max_cols = max(len(row) for row in rows)
            normalized_rows = [
                row + [""] * (max_cols - len(row))
                for row in rows
            ]

            header = normalized_rows[0]
            body = normalized_rows[1:]

            lines = [
                "| " + " | ".join(header) + " |",
                "| " + " | ".join(["---"] * max_cols) + " |",
            ]
            for row in body:
                lines.append("| " + " | ".join(row) + " |")

            return "\n".join(lines)
        except Exception:
            return ""

    def _escape_markdown_cell(self, text: str) -> str:
        """Markdown 표 셀에서 깨지기 쉬운 문자만 최소 escape한다."""
        text = unescape(str(text or ""))
        text = re.sub(r"\s+", " ", text).strip()
        return text.replace("|", r"\|")

    def is_broken(self, text: str) -> bool:
        """표 텍스트가 깨졌는지 간단히 판별한다.

        깨진 표로 판단되면 PdfParser가 PDF의 해당 좌표를 crop해서 VisionParser에
        넘긴다. 즉, 이 메서드는 VLM 복구를 시작할지 말지 결정하는 스위치다.
        """
        if not text:
            return False

        # Unicode replacement character. 인코딩이 깨질 때 자주 들어온다.
        if "\ufffd" in text:
            return True

        # Private Use Area 문자는 OCR/인코딩 깨짐에서 종종 나타난다.
        if re.search(r"[\uE000-\uF8FF]", text):
            return True

        return False
