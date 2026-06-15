import re
from html import unescape
from html.parser import HTMLParser


MAX_TABLE_CHARS = 1000
TARGET_TABLE_CHARS = 700
MIN_CHILD_CHARS = 120
KEEP_TABLE_PARENT_CHUNK = False
CREATE_TABLE_SUMMARY_CHUNK = True

DESCRIPTION_HEADERS = {
    "\uad6c\ubd84",
    "\uc8fc\uc694 \ub0b4\uc6a9",
    "\uc8fc\uc694\ub0b4\uc6a9",
    "\ub0b4\uc6a9",
    "\ud56d\ubaa9",
    "\uc804\ub7b5",
    "\ucd94\uc9c4\ub0b4\uc6a9",
    "\uc138\ubd80\ub0b4\uc6a9",
}
NUMERIC_HEADERS = {
    "\ube44\ubaa9",
    "\uc9c0\ud45c\uba85",
    "\uc131\uacfc\uc9c0\ud45c",
    "\uc608\uc0b0",
    "\uc9d1\ud589",
    "\uc774\uc6d4\uae08",
    "\uc794\uc561",
    "\uc9d1\ud589\ub960",
    "\uc2e4\uc9d1\ud589\ub960",
    "\uae30\uc900\uac12",
    "\ubaa9\ud453\uac12",
    "\ubaa9\ud45c\uac12",
    "\uc2e4\uc801\uac12",
    "\ub2ec\uc131\ub3c4",
    "\ube44\uc728",
    "\uae08\uc561",
    "\ud569\uacc4",
}
LABEL_HEADERS = {
    "\ube44\ubaa9",
    "\uc9c0\ud45c\uba85",
    "\uad6c\ubd84",
    "\uc131\uacfc\uc9c0\ud45c",
}
AMOUNT_HEADERS = {
    "\uc608\uc0b0",
    "\uc9d1\ud589",
    "\uc774\uc6d4\uae08",
    "\uc794\uc561",
    "\uae08\uc561",
    "\uc0ac\uc5c5\ube44",
    "\uc18c\uc694\uc608\uc0b0",
}
RATE_HEADERS = {
    "\ub960",
    "\uc728",
    "\uc9d1\ud589\ub960",
    "\uc2e4\uc9d1\ud589\ub960",
    "\ub2ec\uc131\ub3c4",
    "\ube44\uc728",
    "%",
}
TOTAL_LABELS = {
    "\ud569\uacc4",
    "\ucd1d\uacc4",
    "\ucd1d \ud569\uacc4",
    "\uc18c\uacc4",
    "\uacc4",
}
FINANCIAL_VALUE_HEADERS = [
    "\uc608\uc0b0 (A)",
    "\uc9d1\ud589 (B)",
    "\uc774\uc6d4\uae08 (C)",
    "\uc794\uc561 (A-B-C)",
    "\uc9d1\ud589\ub960 ((B+C)/A \u00d7100, %)",
    "\uc2e4\uc9d1\ud589\ub960 (B/A \u00d7100, %)",
]
INDICATOR_VALUE_HEADERS = [
    "\uae30\uc900\uac12(A) ('22.2.)",
    "\ubaa9\ud453\uac12(B)",
    "\uc2e4\uc801\uac12 (C)",
    "\ub2ec\uc131\ub3c4 (C/B\u00d7100, %)",
]
LIST_MARK_RE = re.compile(r"([\u2460-\u2469]|\d+\)|\(\d+\)|[-\u2022]\s+)")
VALUE_NUMBER_RE = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?%?")


class _HtmlRowParser(HTMLParser):
    """Small stdlib HTML table row extractor for chunking heuristics."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self._in_row = False
        self._in_cell = False
        self._current_row = []
        self._current_cell = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self._in_row = True
            self._current_row = []
        elif tag in {"td", "th"} and self._in_row:
            self._in_cell = True
            self._current_cell = []
        elif tag == "br" and self._in_cell:
            self._current_cell.append(" ")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"td", "th"} and self._in_cell:
            text = self._normalize_text("".join(self._current_cell))
            if text:
                self._current_row.append(text)
            self._current_cell = []
            self._in_cell = False
        elif tag == "tr" and self._in_row:
            if self._current_row:
                self.rows.append(self._current_row)
            self._current_row = []
            self._in_row = False

    def handle_data(self, data):
        if self._in_cell:
            self._current_cell.append(data)

    @staticmethod
    def _normalize_text(text: str) -> str:
        text = unescape(str(text or ""))
        return re.sub(r"\s+", " ", text).strip()


class TableChunker:
    """Split long table_text elements into smaller search-friendly child chunks."""

    def __init__(
        self,
        max_table_chars: int = MAX_TABLE_CHARS,
        target_table_chars: int = TARGET_TABLE_CHARS,
        min_child_chars: int = MIN_CHILD_CHARS,
    ):
        self.max_table_chars = max_table_chars
        self.target_table_chars = target_table_chars
        self.min_child_chars = min_child_chars

    def should_split(self, element: dict) -> bool:
        return (
            element.get("type") == "table_text"
            and len(str(element.get("content", ""))) > self.max_table_chars
        )

    def split_table_element(self, element: dict, parent_chunk_id: int) -> list[dict]:
        content_numeric_parts = self._split_numeric_table_from_content(element.get("content", ""))
        rows = self._extract_rows(element.get("raw_table", ""))
        if rows:
            parts = self._split_rows(rows)
        else:
            parts = self._fallback_split(element.get("content", ""))

        if content_numeric_parts:
            non_numeric_parts = [
                part for part in parts
                if not self._looks_numeric_part(part)
            ]
            parts = non_numeric_parts + content_numeric_parts

        parts = self._merge_small_parts(parts)
        parts = self._split_oversized_parts(parts)

        chunks = []
        if CREATE_TABLE_SUMMARY_CHUNK:
            summary = self._make_summary(element, parts)
            if summary:
                chunks.append(summary)

        for part in parts:
            chunks.append(self._child_chunk(element, parent_chunk_id, part))

        if KEEP_TABLE_PARENT_CHUNK:
            chunks.insert(0, self._parent_chunk(element, parent_chunk_id))

        return chunks

    def _extract_rows(self, raw_table: str) -> list[list[str]]:
        if not raw_table or "<table" not in str(raw_table).lower():
            return []
        parser = _HtmlRowParser()
        try:
            parser.feed(str(raw_table))
            return parser.rows
        except Exception:
            return []

    def _split_rows(self, rows: list[list[str]]) -> list[dict]:
        header_text = " ".join(rows[0]) if rows else ""
        sample_text = " ".join(" ".join(row) for row in rows)
        is_numeric = any(self._numeric_header_info(row) for row in rows)
        is_description = self._has_any(header_text or sample_text, DESCRIPTION_HEADERS)

        if is_numeric:
            return self._split_numeric_rows(rows)
        if is_description:
            return self._split_description_rows(rows)
        return self._split_description_rows(rows)

    def _split_description_rows(self, rows: list[list[str]]) -> list[dict]:
        parts = []
        data_rows = rows[1:] if rows and self._looks_like_header(rows[0]) else rows

        for row in data_rows:
            if not row:
                continue
            section_title = row[0]
            body = " ".join(row[1:]).strip() if len(row) > 1 else row[0]
            text = f"{section_title}\n{body}".strip() if body != section_title else body
            row_parts = self._split_numbered_text(text, section_title)
            for part in row_parts:
                part["markdown_table"] = self._row_markdown(["section", "content"], [section_title, body])
            parts.extend(row_parts)

        return parts

    def _split_numeric_rows(self, rows: list[list[str]]) -> list[dict]:
        if not rows:
            return []

        parts = []
        header = []
        current_section = ""
        for row_index, row in enumerate(rows):
            if not row:
                continue

            header_info = self._numeric_header_info(row)
            row_numeric_count = sum(1 for cell in row if self._contains_number(cell))
            if header_info and row_numeric_count <= 2:
                next_section, header = header_info
                if next_section:
                    current_section = next_section
                continue

            if row_index == 0 and self._looks_like_header(row):
                continue

            if len(row) == 1 and not self._contains_number(row[0]):
                current_section = row[0]
                continue

            if not header and len(row) > 1:
                section_title = row[0]
                body = " ".join(row[1:]).strip()
                text = f"{section_title}\n{body}".strip()
                row_parts = self._split_numbered_text(text, section_title)
                for part in row_parts:
                    part["markdown_table"] = self._row_markdown(["section", "content"], [section_title, body])
                parts.extend(row_parts)
                continue

            if header and row_numeric_count > 0:
                parts.append(self._numeric_row_part(current_section, header, row))
                continue

            if row_numeric_count == 0 and len(row) > 1:
                section_title = row[0]
                body = " ".join(row[1:]).strip()
                parts.append(
                    {
                        "section_title": section_title,
                        "content": f"{section_title}\n{body}".strip(),
                        "markdown_table": self._row_markdown(["section", "content"], [section_title, body]),
                    }
                )

        return parts or self._split_description_rows(rows)

    def _numeric_header_info(self, row: list[str]) -> tuple[str, list[str]] | None:
        if not row:
            return None

        keyword_count = sum(1 for cell in row if self._has_any(cell, NUMERIC_HEADERS))
        has_label_header = any(self._has_any(cell, LABEL_HEADERS) for cell in row)
        has_amount_or_rate = any(
            self._has_any(cell, AMOUNT_HEADERS | RATE_HEADERS)
            for cell in row
        )
        if keyword_count < 2 and not (has_label_header and has_amount_or_rate):
            return None

        if len(row) > 1 and not self._is_exact_keyword(row[0], LABEL_HEADERS | AMOUNT_HEADERS | RATE_HEADERS):
            return row[0], row[1:]
        return "", row

    def _numeric_row_part(self, table_section: str, header: list[str], row: list[str]) -> dict:
        row_label = row[0] if row else ""
        pairs = self._pair_numeric_cells(header, row)
        section_title = self._join_section_title(table_section, row_label)
        unit = self._amount_unit(table_section, header)

        lines = []
        if section_title:
            lines.append(section_title)
        for label, value in pairs:
            value = self._format_numeric_value(label, value, unit)
            lines.append(f"{label}: {value}" if label else value)

        return {
            "section_title": section_title or row_label,
            "content": "\n".join(line for line in lines if line).strip(),
            "markdown_table": self._pairs_markdown(pairs, unit),
            "no_merge": True,
        }

    def _pair_numeric_cells(self, header: list[str], row: list[str]) -> list[tuple[str, str]]:
        if not header:
            return [("", cell) for cell in row]

        first_header_is_label = self._has_any(header[0], LABEL_HEADERS)
        if first_header_is_label:
            labels = header[: len(row)]
            values = row[: len(labels)]
        else:
            labels = header[-len(row):] if len(header) >= len(row) else header[:]
            values = row[-len(labels):] if labels else row
            if row and (not labels or labels[0] != row[0]):
                labels = ["row"] + labels
                values = [row[0]] + values

        pairs = []
        for index, value in enumerate(values):
            label = labels[index] if index < len(labels) else ""
            pairs.append((label, value))
        return pairs

    def _join_section_title(self, table_section: str, row_label: str) -> str:
        table_section = str(table_section or "").strip()
        row_label = str(row_label or "").strip()
        if table_section and row_label:
            return f"{table_section} - {row_label}"
        return row_label or table_section

    def _amount_unit(self, table_section: str, header: list[str]) -> str:
        text = " ".join([str(table_section or ""), *header])
        if "\ubc31\ub9cc\uc6d0" in text:
            return "\ubc31\ub9cc\uc6d0"
        if "\ucc9c\uc6d0" in text:
            return "\ucc9c\uc6d0"
        if "\ub9cc\uc6d0" in text:
            return "\ub9cc\uc6d0"
        return ""

    def _format_numeric_value(self, label: str, value: str, amount_unit: str) -> str:
        label = str(label or "")
        value = str(value or "").strip()
        if not value:
            return value

        if self._is_rate_header(label) and self._is_plain_number(value) and "%" not in value:
            return f"{value}%"
        if (
            amount_unit
            and self._is_amount_header(label)
            and self._is_plain_number(value)
            and not self._has_known_unit(value)
        ):
            return f"{value}{amount_unit}"
        return value

    def _pairs_markdown(self, pairs: list[tuple[str, str]], amount_unit: str = "") -> str:
        lines = ["| item | value |", "| --- | --- |"]
        for label, value in pairs:
            lines.append(f"| {label} | {self._format_numeric_value(label, value, amount_unit)} |")
        return "\n".join(lines)

    def _is_rate_header(self, label: str) -> bool:
        return self._has_any(label, RATE_HEADERS)

    def _is_amount_header(self, label: str) -> bool:
        if self._is_rate_header(label):
            return False
        return self._has_any(label, AMOUNT_HEADERS)

    @staticmethod
    def _has_known_unit(value: str) -> bool:
        units = [
            "\ubc31\ub9cc\uc6d0",
            "\ucc9c\uc6d0",
            "\ub9cc\uc6d0",
            "\uc6d0",
            "%",
        ]
        return any(unit in str(value or "") for unit in units)

    def _split_numeric_table_from_content(self, content: str) -> list[dict]:
        lines = [line.strip() for line in str(content or "").splitlines() if line.strip()]
        if not lines:
            return []

        parts = []
        current_section = ""
        current_label_header = ""
        current_value_headers = []
        pending_label = ""

        for line in lines:
            header_info = self._content_header_info(line, pending_label)
            if header_info:
                current_section = header_info["section"]
                current_label_header = header_info["label_header"]
                current_value_headers = header_info["value_headers"]
                pending_label = ""
                continue

            if not current_value_headers:
                pending_label = ""
                continue

            values, label = self._split_content_numeric_row(line, len(current_value_headers))
            if values:
                row_label = label or pending_label
                if row_label:
                    pairs = [(current_label_header, row_label)]
                    pairs.extend(zip(current_value_headers, values))
                    section_title = self._join_section_title(current_section, row_label)
                    unit = self._amount_unit(current_section, current_value_headers)
                    content_lines = [section_title]
                    for pair_label, pair_value in pairs:
                        pair_value = self._format_numeric_value(pair_label, pair_value, unit)
                        content_lines.append(f"{pair_label}: {pair_value}")
                    parts.append(
                        {
                            "section_title": section_title,
                            "content": "\n".join(content_lines).strip(),
                            "markdown_table": self._pairs_markdown(pairs, unit),
                            "no_merge": True,
                        }
                    )
                pending_label = ""
                continue

            if not self._contains_number(line):
                pending_label = line

        return parts

    def _content_header_info(self, line: str, pending_section: str = "") -> dict | None:
        normalized = re.sub(r"\s+", "", line)
        financial_markers = [
            "\ube44\ubaa9",
            "\uc608\uc0b0",
            "\uc9d1\ud589",
            "\uc774\uc6d4\uae08",
            "\uc794\uc561",
        ]
        indicator_markers = [
            "\uc9c0\ud45c\uba85",
            "\uae30\uc900\uac12",
            "\uc2e4\uc801\uac12",
            "\ub2ec\uc131\ub3c4",
        ]

        if all(marker in normalized for marker in financial_markers[:4]):
            label = "\ube44\ubaa9"
            section = self._section_before_marker(line, label) or pending_section
            return {
                "section": section,
                "label_header": label,
                "value_headers": FINANCIAL_VALUE_HEADERS,
            }

        if all(marker in normalized for marker in indicator_markers):
            label = "\uc9c0\ud45c\uba85"
            section = self._section_before_marker(line, label) or pending_section
            return {
                "section": section,
                "label_header": label,
                "value_headers": INDICATOR_VALUE_HEADERS,
            }

        return None

    def _section_before_marker(self, line: str, marker: str) -> str:
        index = line.find(marker)
        if index <= 0:
            return ""
        return line[:index].strip()

    def _split_content_numeric_row(self, line: str, value_count: int) -> tuple[list[str], str]:
        matches = list(VALUE_NUMBER_RE.finditer(line))
        if len(matches) < value_count:
            return [], ""

        value_matches = matches[-value_count:]
        values = [match.group(0) for match in value_matches]
        label = line[: value_matches[0].start()].strip()
        return values, label

    def _fallback_split(self, content: str) -> list[dict]:
        lines = [line.strip() for line in str(content or "").splitlines() if line.strip()]
        if not lines:
            return []

        parts = []
        current = ""
        for line in lines:
            if len(current) + len(line) + 1 > self.target_table_chars and current:
                parts.extend(self._split_numbered_text(current))
                current = line
            else:
                current = f"{current}\n{line}".strip() if current else line
        if current:
            parts.extend(self._split_numbered_text(current))
        return parts

    def _split_numbered_text(self, text: str, section_title: str = "") -> list[dict]:
        text = str(text or "").strip()
        if len(text) <= self.target_table_chars:
            return [{"section_title": section_title, "content": text}]

        matches = list(LIST_MARK_RE.finditer(text))
        if len(matches) < 3:
            return self._split_by_sentences(text, section_title)

        parts = []
        head = text[: matches[0].start()].strip()
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            segment = text[start:end].strip()
            if head and idx == 0:
                segment = f"{head}\n{segment}"
            parts.append({"section_title": section_title, "content": segment})
        return parts

    def _split_by_sentences(self, text: str, section_title: str = "") -> list[dict]:
        sentences = re.split(r"(?<=[.!?\u3002])\s+", text)
        parts = []
        current = ""
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(current) + len(sentence) + 1 > self.target_table_chars and current:
                parts.append({"section_title": section_title, "content": current.strip()})
                current = sentence
            else:
                current = f"{current} {sentence}".strip() if current else sentence
        if current:
            parts.append({"section_title": section_title, "content": current.strip()})

        if len(parts) == 1 and len(parts[0]["content"]) > self.target_table_chars:
            return self._split_by_chars(parts[0]["content"], section_title)
        return parts

    def _split_by_chars(self, text: str, section_title: str = "") -> list[dict]:
        parts = []
        for start in range(0, len(text), self.target_table_chars):
            parts.append(
                {
                    "section_title": section_title,
                    "content": text[start : start + self.target_table_chars].strip(),
                }
            )
        return parts

    def _merge_small_parts(self, parts: list[dict]) -> list[dict]:
        merged = []
        buffer = None
        for part in parts:
            content = part.get("content", "").strip()
            if not content:
                continue
            if part.get("no_merge"):
                if buffer:
                    merged.append(buffer)
                    buffer = None
                next_part = part.copy()
                next_part["content"] = content
                merged.append(next_part)
                continue
            if buffer is None:
                buffer = part.copy()
                buffer["content"] = content
                continue

            if buffer.get("no_merge"):
                merged.append(buffer)
                buffer = part.copy()
                buffer["content"] = content
            elif len(buffer["content"]) < self.min_child_chars:
                buffer["content"] = f"{buffer['content']}\n{content}".strip()
                if not buffer.get("section_title"):
                    buffer["section_title"] = part.get("section_title", "")
            else:
                merged.append(buffer)
                buffer = part.copy()
                buffer["content"] = content

        if buffer:
            merged.append(buffer)
        return merged

    def _split_oversized_parts(self, parts: list[dict]) -> list[dict]:
        result = []
        for part in parts:
            content = part.get("content", "")
            if part.get("no_merge") or len(content) <= self.max_table_chars:
                result.append(part)
                continue
            result.extend(self._split_numbered_text(content, part.get("section_title", "")))
        return result

    def _make_summary(self, element: dict, parts: list[dict]) -> dict | None:
        titles = []
        for part in parts:
            title = str(part.get("section_title", "")).strip()
            if title and title not in titles:
                titles.append(title)
            if len(titles) >= 8:
                break
        if not titles:
            return None

        content = "\uc774 \ud45c\ub294 " + ", ".join(titles) + " \ud56d\ubaa9\uc744 \ud3ec\ud568\ud55c\ub2e4."
        return {
            "type": "table_text_summary",
            "parent_type": "table_text",
            "section_title": "table summary",
            "content": content,
            "raw_content": element.get("raw_content"),
            "raw_table": element.get("raw_table"),
            "markdown_table": element.get("markdown_table"),
        }

    def _child_chunk(self, element: dict, parent_chunk_id: int, part: dict) -> dict:
        element_index = element.get("element_index")
        parent_indexes = [element_index] if element_index is not None else []
        return {
            "type": "table_text_child",
            "parent_type": "table_text",
            "parent_chunk_id": parent_chunk_id,
            "parent_element_indexes": parent_indexes,
            "parent_page": element.get("page"),
            "section_title": part.get("section_title", ""),
            "content": part.get("content", ""),
            "raw_content": element.get("raw_content"),
            "raw_table": element.get("raw_table"),
            "markdown_table": part.get("markdown_table") or element.get("markdown_table"),
        }

    def _parent_chunk(self, element: dict, parent_chunk_id: int) -> dict:
        return {
            "type": "table_text",
            "parent_chunk_id": parent_chunk_id,
            "section_title": "",
            "content": element.get("content", ""),
            "raw_content": element.get("raw_content"),
            "raw_table": element.get("raw_table"),
            "markdown_table": element.get("markdown_table"),
        }

    @staticmethod
    def _has_any(text: str, keywords: set[str]) -> bool:
        normalized = re.sub(r"\s+", "", str(text or ""))
        return any(re.sub(r"\s+", "", keyword) in normalized for keyword in keywords)

    @staticmethod
    def _is_exact_keyword(text: str, keywords: set[str]) -> bool:
        normalized = re.sub(r"\s+", "", str(text or ""))
        return any(normalized == re.sub(r"\s+", "", keyword) for keyword in keywords)

    @staticmethod
    def _looks_like_header(row: list[str]) -> bool:
        joined = " ".join(row)
        return TableChunker._has_any(joined, DESCRIPTION_HEADERS | NUMERIC_HEADERS)

    @staticmethod
    def _contains_number(text: str) -> bool:
        return bool(re.search(r"\d", str(text or "")))

    @staticmethod
    def _is_plain_number(text: str) -> bool:
        return bool(re.fullmatch(r"[-+]?\d[\d,]*(?:\.\d+)?", str(text or "").strip()))

    @staticmethod
    def _looks_numeric_part(part: dict) -> bool:
        content = str(part.get("content", ""))
        number_count = len(VALUE_NUMBER_RE.findall(content))
        for line in content.splitlines():
            numbers = VALUE_NUMBER_RE.findall(line)
            non_numeric_text = VALUE_NUMBER_RE.sub("", line)
            non_numeric_text = re.sub(r"[\s,.:;/%()A-Za-z+-]+", "", non_numeric_text)
            if len(numbers) >= 4 and len(non_numeric_text) <= 10:
                return True
        normalized = re.sub(r"\s+", "", content)
        numeric_markers = [
            "\ube44\ubaa9",
            "\uc608\uc0b0",
            "\uc9d1\ud589",
            "\uc774\uc6d4\uae08",
            "\uc9c0\ud45c\uba85",
            "\uae30\uc900\uac12",
            "\uc2e4\uc801\uac12",
            "\ub2ec\uc131\ub3c4",
        ]
        return any(marker in normalized for marker in numeric_markers) and number_count > 0

    @staticmethod
    def _row_markdown(header: list[str], row: list[str]) -> str:
        if not header or not row:
            return ""
        width = max(len(header), len(row))
        header = (header + [""] * width)[:width]
        row = (row + [""] * width)[:width]
        return (
            "| " + " | ".join(header) + " |\n"
            "| " + " | ".join(["---"] * width) + " |\n"
            "| " + " | ".join(row) + " |"
        )
