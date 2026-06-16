import json
import re
import hashlib
import shutil
from collections import defaultdict
from datetime import datetime
from inspect import signature
from pathlib import Path
from time import perf_counter, sleep

from parsers.parser_factory import ParserFactory
from parsers.table_parser import TableParser
from processors.chunker import Chunker
from processors.embedder import Embedder
from processors.text_cleaner import TextCleaner
from vector_db.qdrant_repository import QdrantRepository


TEXT_ONLY_EXCLUDED_TYPES = {"image", "figure", "chart"}
TOC_TYPES = {"toc"}
FOOTER_TYPES = {"footer"}


class PipelineManager:
    """문서 ingestion 파이프라인 전체를 순서대로 실행하는 지휘자."""

    def __init__(self):
        self.chunker = Chunker()
        self.embedder = Embedder()
        self.qdrant = QdrantRepository()
        self.processed_dir = Path("processed")
        self.cache_dir = self.processed_dir / "cache"
        self.backup_dir = self.processed_dir / "backups"
        self.tables = TableParser()

    def _log_time(self, label: str, started_at: float, timings: dict) -> None:
        """한 단계가 끝날 때마다 걸린 시간을 저장하고 출력한다."""
        elapsed = perf_counter() - started_at
        timings[label] = round(elapsed, 3)
        print(f"[Timing] {label}: {elapsed:.3f}s")

    def _backup_if_exists(self, output_path: Path) -> None:
        """processed 파일을 덮어쓰기 전에 backups 폴더에 보관한다."""
        if not output_path.exists():
            return

        self.backup_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{output_path.stem}_{timestamp}{output_path.suffix}"
        backup_path = self.backup_dir / backup_name
        shutil.copy2(output_path, backup_path)
        print(f"[Processed] Backed up existing file: {backup_path}")

    def _file_hash(self, file_path: str) -> str:
        """PDF 파일 내용 기반 cache key를 만든다."""
        digest = hashlib.sha256()
        with open(file_path, "rb") as f:
            for block in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()[:16]

    def _parsed_cache_path(self, file_path: str, text_only: bool) -> Path:
        suffix = "parsed_elements_text_only" if text_only else "parsed_elements"
        return self.cache_dir / f"{self._file_hash(file_path)}_{suffix}.jsonl"

    def _legacy_parsed_path(self, text_only: bool) -> Path:
        name = "parsed_elements_text_only.jsonl" if text_only else "parsed_elements.jsonl"
        return self.processed_dir / name

    def _read_parsed_jsonl(self, parsed_path: Path) -> list:
        """JSONL parsed element 파일을 element 리스트로 읽는다."""
        elements = []
        with parsed_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                elements.append(json.loads(line))
        return elements

    def _write_parsed_cache(self, file_path: str, elements: list, text_only: bool) -> Path:
        """정규화된 parsed element를 파일 해시 기반 cache에 저장한다."""
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = self._parsed_cache_path(file_path, text_only)
        source_file = Path(file_path).name

        with cache_path.open("w", encoding="utf-8") as f:
            for element in elements:
                record = element.copy()
                record.setdefault("source_file", source_file)
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[Cache] Saved parsed cache: {cache_path}")
        return cache_path

    def _strong_toc_for_table(self, text: str) -> bool:
        """table_text cache를 재사용할 때 강한 목차 신호만 다시 판단한다."""
        normalized = re.sub(r"\s+", " ", str(text or ""))
        if "목 차" in normalized or "목차" in normalized:
            return True
        leader_count = len(re.findall(r"\.{4,}|·{3,}|-{4,}", normalized))
        return leader_count >= 2

    def _refresh_cached_elements(self, elements: list, text_only: bool) -> list:
        """오래된 parsed cache를 현재 후처리 규칙과 보조 필드에 맞게 보정한다."""
        refreshed = []
        for element in elements:
            item = element.copy()

            if text_only and item.get("original_type") == "table":
                raw_content = item.get("raw_content") or item.get("content", "")
                item["content"] = TextCleaner.clean_common(str(raw_content))
                item["raw_content"] = raw_content
                item["markdown_table"] = item.get("markdown_table") or self.tables.html_to_markdown(
                    item.get("raw_table", "")
                )
                if self._strong_toc_for_table(item["content"]):
                    item["type"] = "toc"
                    item["is_toc"] = True
                else:
                    item["type"] = "table_text"
                    item["is_toc"] = False
            elif text_only:
                raw_content = item.get("raw_content") or item.get("content", "")
                item["content"] = TextCleaner.clean_common(str(raw_content))
                item["raw_content"] = raw_content

            refreshed.append(item)

        return refreshed

    def _write_extracted(self, file_path: str, elements: list) -> None:
        """Parser가 만든 element 결과를 processed/extracted.jsonl에 저장한다.

        학교 요구사항은 파일명/본문/추출일자를 포함한 JSONL 저장이다.
        현재 프로젝트는 RAG에 유리하도록 문서 전체 1줄이 아니라 element 단위로 저장한다.
        """
        self.processed_dir.mkdir(exist_ok=True)
        output_path = self.processed_dir / "extracted.jsonl"
        extracted_at = datetime.now().isoformat(timespec="seconds")
        file_name = Path(file_path).name

        with output_path.open("a", encoding="utf-8") as f:
            for element in elements:
                record = {
                    "file_name": file_name,
                    "page": element.get("page"),
                    "type": element.get("type"),
                    "raw_content": element.get("raw_content", element.get("content", "")),
                    "content": element.get("content", ""),
                    "extracted_at": extracted_at,
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[Processed] Saved extracted elements: {output_path}")

    def _write_parsed_elements(
        self,
        file_path: str,
        elements: list,
        text_only: bool = False,
    ) -> None:
        """Upstage element 순서를 확인하기 위한 parsed element 디버그 파일을 저장한다."""
        self.processed_dir.mkdir(exist_ok=True)
        output_name = "parsed_elements_text_only.jsonl" if text_only else "parsed_elements.jsonl"
        output_path = self.processed_dir / output_name
        self._backup_if_exists(output_path)
        source_file = Path(file_path).name

        with output_path.open("w", encoding="utf-8") as f:
            for element in elements:
                record = {
                    "source_file": source_file,
                    "page": element.get("page"),
                    "element_index": element.get("element_index"),
                    "type": element.get("type"),
                    "is_toc": element.get("is_toc", False),
                    "original_type": element.get("original_type"),
                    "raw_table": element.get("raw_table"),
                    "markdown_table": element.get("markdown_table"),
                    "raw_content": element.get("raw_content", element.get("content", "")),
                    "content": element.get("content", ""),
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[Processed] Saved parsed element debug file: {output_path}")

    def _write_chunks(
        self,
        file_path: str,
        chunks: list,
        text_only: bool = False,
    ) -> None:
        """Qdrant 적재 직전 chunk 상태를 확인하기 위한 디버그 파일을 저장한다."""
        self.processed_dir.mkdir(exist_ok=True)
        output_name = "chunks_text_only.jsonl" if text_only else "chunks.jsonl"
        output_path = self.processed_dir / output_name
        self._backup_if_exists(output_path)
        source_file = Path(file_path).name

        with output_path.open("w", encoding="utf-8") as f:
            for chunk in chunks:
                record = {
                    "source_file": source_file,
                    "page": chunk.get("page"),
                    "page_number": chunk.get("page_number", chunk.get("page")),
                    "page_label": chunk.get("page_label"),
                    "is_first_page": chunk.get("is_first_page"),
                    "chunk_id": chunk.get("chunk_id"),
                    "chunk_order": chunk.get("chunk_order"),
                    "document_order": chunk.get("document_order"),
                    "type": chunk.get("type"),
                    "original_type": chunk.get("original_type"),
                    "parent_type": chunk.get("parent_type"),
                    "parent_chunk_id": chunk.get("parent_chunk_id"),
                    "parent_element_indexes": chunk.get("parent_element_indexes", []),
                    "parent_page": chunk.get("parent_page"),
                    "section_title": chunk.get("section_title"),
                    "parent_section": chunk.get("parent_section"),
                    "element_indexes": chunk.get("element_indexes", []),
                    "raw_content": chunk.get("raw_content"),
                    "raw_table": chunk.get("raw_table"),
                    "markdown_table": chunk.get("markdown_table"),
                    "content": chunk.get("content", ""),
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[Processed] Saved chunk debug file: {output_path}")

    def _write_text_preview(self, file_path: str, chunks: list) -> None:
        """본문 text chunk만 사람이 읽기 쉬운 Markdown 파일로 저장한다.

        표와 이미지는 제외하고 type == "text"인 chunk만 저장한다.
        PDF 본문 추출 순서와 chunking 결과가 자연스러운지 먼저 확인하기 위한 파일이다.
        """
        self.processed_dir.mkdir(exist_ok=True)
        output_path = self.processed_dir / "text_preview.md"
        self._backup_if_exists(output_path)
        source_file = Path(file_path).name

        lines = [
            "# Text Preview",
            "",
            f"- source_file: `{source_file}`",
            "- includes: text/table_text/table_text_child/table_text_summary chunks",
            "- excludes: image/figure/chart/toc chunks",
            "",
        ]

        current_page = None
        text_count = 0
        for chunk in chunks:
            if chunk.get("type") not in {
                "text",
                "table_text",
                "table_text_child",
                "table_text_summary",
            }:
                continue

            text_count += 1
            page = chunk.get("page_number", chunk.get("page"))
            if page != current_page:
                current_page = page
                lines.extend(
                    [
                        "",
                        f"## Page {page}",
                        "",
                    ]
                )

            lines.extend(
                [
                    (
                        f"### Chunk {chunk.get('chunk_id')} / "
                        f"order {chunk.get('chunk_order')} / "
                        f"type {chunk.get('type')}"
                    ),
                    "",
                    f"- element_indexes: {chunk.get('element_indexes', [])}",
                    f"- parent_type: {chunk.get('parent_type')}",
                    f"- parent_chunk_id: {chunk.get('parent_chunk_id')}",
                    f"- parent_element_indexes: {chunk.get('parent_element_indexes', [])}",
                    f"- parent_section: {chunk.get('parent_section')}",
                    f"- section_title: {chunk.get('section_title')}",
                    f"- length: {len(chunk.get('content', ''))}",
                    "",
                    "Plain text:",
                    "",
                    chunk.get("content", ""),
                    "",
                ]
            )
            markdown_table = chunk.get("markdown_table")
            if chunk.get("type") in {"table_text", "table_text_child", "table_text_summary"} and markdown_table:
                preview_table = markdown_table
                if len(preview_table) > 3000:
                    preview_table = preview_table[:3000].rstrip() + "\n\n... (truncated)"
                lines.extend(
                    [
                        "Markdown table:",
                        "",
                        preview_table,
                        "",
                    ]
                )

            lines.extend(["---", ""])

        if text_count == 0:
            lines.append("_No text chunks found._")

        output_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"[Processed] Saved text preview file: {output_path}")

    def _group_elements_by_page(self, elements: list) -> dict:
        """Element 리스트를 page 기준으로 묶고 element_index 순서로 정렬한다."""
        pages = defaultdict(list)
        for element in elements:
            pages[element.get("page")].append(element)

        for page_elements in pages.values():
            page_elements.sort(key=lambda item: item.get("element_index") or 0)

        return dict(sorted(pages.items(), key=lambda item: item[0] or 0))

    def _write_page_text_preview(self, file_path: str, elements: list) -> None:
        """Chunking 전 parse 결과를 page 단위 Markdown preview로 저장한다."""
        self.processed_dir.mkdir(exist_ok=True)
        output_path = self.processed_dir / "page_text_preview.md"
        self._backup_if_exists(output_path)
        source_file = Path(file_path).name

        lines = [
            "# Page Text Preview",
            "",
            f"- source_file: `{source_file}`",
            "- source: parsed elements before chunking",
            "- includes: text/table_text/toc elements",
            "",
        ]

        for page, page_elements in self._group_elements_by_page(elements).items():
            lines.extend(["", f"## Page {page}", ""])

            for element in page_elements:
                element_type = element.get("type")
                element_index = element.get("element_index")
                is_toc = element.get("is_toc", False)
                lines.extend(
                    [
                        f"[element {element_index} / type {element_type} / is_toc {is_toc}]",
                        "",
                        element.get("content", ""),
                        "",
                    ]
                )

        output_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"[Pipeline] Saved page preview: {output_path}")

    def _write_page_text_full(self, file_path: str, elements: list) -> None:
        """Chunking 전 parse 결과를 page당 한 줄 JSONL로 저장한다."""
        self.processed_dir.mkdir(exist_ok=True)
        output_path = self.processed_dir / "page_text_full.jsonl"
        self._backup_if_exists(output_path)
        source_file = Path(file_path).name

        with output_path.open("w", encoding="utf-8") as f:
            for page, page_elements in self._group_elements_by_page(elements).items():
                contents = [
                    element.get("content", "")
                    for element in page_elements
                    if element.get("content")
                ]
                element_indexes = [
                    element.get("element_index")
                    for element in page_elements
                    if element.get("element_index") is not None
                ]
                types = [
                    element.get("type")
                    for element in page_elements
                    if element.get("type")
                ]
                record = {
                    "source_file": source_file,
                    "page": page,
                    "content": "\n\n".join(contents),
                    "element_indexes": element_indexes,
                    "types": types,
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

        print(f"[Pipeline] Saved page full JSONL: {output_path}")

    def _record_failure(self, file_path: str, stage: str, reason: str) -> None:
        """실패한 파일과 단계를 processed/failed_files.json에 누적 기록한다."""
        self.processed_dir.mkdir(exist_ok=True)
        output_path = self.processed_dir / "failed_files.json"
        failure = {
            "file_name": Path(file_path).name,
            "file_path": file_path,
            "stage": stage,
            "reason": reason,
            "failed_at": datetime.now().isoformat(timespec="seconds"),
        }

        failures = []
        if output_path.exists():
            try:
                failures = json.loads(output_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                failures = []

        failures.append(failure)
        output_path.write_text(
            json.dumps(failures, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"[Processed] Recorded failure: {stage} - {reason}")

    def _is_text_only_excluded(self, element: dict) -> bool:
        """Return True when an element should not enter the text-only pipeline."""
        element_type = str(element.get("type", "")).lower()
        is_media = any(excluded in element_type for excluded in TEXT_ONLY_EXCLUDED_TYPES)
        is_toc = element.get("is_toc") or element_type in TOC_TYPES
        is_footer = element_type in FOOTER_TYPES
        return is_media or is_toc or is_footer

    def _is_media_excluded(self, element: dict) -> bool:
        """Return True for image/figure/chart elements."""
        element_type = str(element.get("type", "")).lower()
        return any(excluded in element_type for excluded in TEXT_ONLY_EXCLUDED_TYPES)

    def _filter_text_only(self, elements: list) -> list:
        """Keep text/table_text body elements and drop media, TOC, and footer elements."""
        return [
            element for element in elements
            if not self._is_text_only_excluded(element)
        ]

    def _filter_text_media_only(self, elements: list) -> list:
        """Keep text-like elements but leave detected TOC items for debug output."""
        return [
            element for element in elements
            if not self._is_media_excluded(element)
        ]

    def _mark_toc_pages(self, elements: list) -> tuple[list, set]:
        """If one element on a page is TOC-like, mark the whole page as TOC."""
        toc_pages = {
            element.get("page") for element in elements
            if element.get("is_toc") or str(element.get("type", "")).lower() in TOC_TYPES
        }
        toc_pages.discard(None)

        for element in elements:
            if element.get("page") in toc_pages:
                element["is_toc"] = True
                element["type"] = "toc"

        return elements, toc_pages

    def _clean_text_only_body(self, elements: list) -> list:
        """Conservatively clean body text before text-only chunking."""
        line_pages = defaultdict(set)
        for element in elements:
            page = element.get("page")
            content = TextCleaner.clean_common(str(element.get("content", "")))
            for line in content.splitlines():
                normalized = re.sub(r"\s+", " ", line).strip()
                if 2 <= len(normalized) <= 80:
                    line_pages[normalized].add(page)

        repeated_lines = {
            line for line, pages in line_pages.items()
            if len(pages) >= 3
        }

        cleaned_elements = []
        for element in elements:
            content = TextCleaner.clean_common(str(element.get("content", "")))
            cleaned_lines = []
            for line in content.splitlines():
                line = re.sub(r"[ \t]+", " ", line).strip()
                if not line:
                    continue
                if re.fullmatch(r"\d{1,3}", line):
                    continue
                if re.fullmatch(r"\d{1,3}\s*[●•]", line):
                    continue
                if re.fullmatch(r"[●•]\s*\d{1,3}", line):
                    continue
                if re.fullmatch(r"[-–—_=]{4,}", line):
                    continue
                if re.fullmatch(r"[.·ㆍ]{4,}", line):
                    continue
                if line in repeated_lines:
                    continue

                line = re.sub(r"\.{4,}|·{3,}|ㆍ{3,}|-{4,}", " ", line)
                line = re.sub(r"[ \t]+", " ", line).strip()
                if line:
                    cleaned_lines.append(line)

            cleaned_content = "\n".join(cleaned_lines).strip()
            if cleaned_content:
                cleaned = element.copy()
                cleaned["content"] = cleaned_content
                cleaned_elements.append(cleaned)

        return cleaned_elements

    def run(
        self,
        file_path: str,
        limit_chunks: int | None = None,
        text_only: bool = False,
        parse_only: bool = False,
        chunk_only: bool = False,
        no_embed: bool = False,
        embed: bool = False,
        allow_api: bool = False,
        force_api: bool = False,
        from_parsed: str | None = None,
        reset_collection: bool = False,
    ) -> dict:
        """파일 하나를 RAG 검색에 쓸 수 있는 벡터 데이터로 변환한다.

        limit_chunks가 있으면 앞 N개 chunk만 임베딩/Qdrant 적재한다.
        큰 PDF를 처음 테스트할 때 전체 임베딩 시간을 줄이기 위한 옵션이다.
        """
        total_started_at = perf_counter()
        timings = {}

        try:
            if force_api and not allow_api:
                raise ValueError("--force-api requires --allow-api.")
            if embed and (chunk_only or no_embed):
                raise ValueError("--embed cannot be used with --chunk-only or --no-embed.")

            if text_only:
                print(
                    "[Pipeline] Text-only mode enabled. "
                    "Tables are kept as table_text; images/figures/charts and VLM recovery are skipped."
                )
            if parse_only:
                print("[Pipeline] Parse-only mode enabled.")
                print("[Pipeline] Skipping chunking, embedding, and Qdrant insert.")
            if chunk_only:
                print("[Pipeline] Chunk-only mode enabled.")
                print("[Pipeline] Skipping embedding and Qdrant insert.")
            if no_embed:
                print("[Pipeline] No-embed mode enabled.")
                print("[Pipeline] Skipping embedding and Qdrant insert.")
            if not embed and not parse_only:
                print("[INFO] Embedding is disabled by default.")
                print("[INFO] Use --embed to run embedding and Qdrant upload.")

            loaded_from_cache = False
            cache_path = None

            if from_parsed:
                parsed_path = Path(from_parsed)
                if not parsed_path.exists():
                    raise FileNotFoundError(f"parsed file does not exist: {from_parsed}")
                print(f"[Cache] Loading parsed elements from explicit file: {parsed_path}")
                elements = self._read_parsed_jsonl(parsed_path)
                elements = self._refresh_cached_elements(elements, text_only=text_only)
                loaded_from_cache = True
                timings["parse"] = 0
            elif not force_api:
                cache_path = self._parsed_cache_path(file_path, text_only)
                legacy_path = self._legacy_parsed_path(text_only)

                if cache_path.exists():
                    print(f"[Cache] Loading parsed elements: {cache_path}")
                    elements = self._read_parsed_jsonl(cache_path)
                    elements = self._refresh_cached_elements(elements, text_only=text_only)
                    loaded_from_cache = True
                    timings["parse"] = 0
                elif legacy_path.exists():
                    print(f"[Cache] Loading legacy parsed elements: {legacy_path}")
                    elements = self._read_parsed_jsonl(legacy_path)
                    elements = self._refresh_cached_elements(elements, text_only=text_only)
                    cache_path = self._write_parsed_cache(file_path, elements, text_only)
                    loaded_from_cache = True
                    timings["parse"] = 0
                elif not allow_api:
                    message = (
                        "[ERROR] parsed cache 파일이 없습니다.\n"
                        "API 호출은 기본적으로 비활성화되어 있습니다.\n"
                        "API를 사용하려면 --allow-api 옵션을 명시하세요."
                    )
                    print(message)
                    self._record_failure(file_path, "cache", "parsed cache not found and API disabled")
                    return {
                        "status": "failed",
                        "error": "parsed cache not found and API disabled",
                        "text_only": text_only,
                        "parse_only": parse_only,
                        "chunk_only": chunk_only,
                        "no_embed": no_embed,
                        "embed": embed,
                        "allow_api": allow_api,
                        "force_api": force_api,
                        "from_parsed": from_parsed,
                        "reset_collection": reset_collection,
                        "timings": timings,
                    }

            if not loaded_from_cache:
                if allow_api:
                    print("[WARNING] 문서 파싱 API를 호출합니다. 비용이 발생할 수 있습니다.")
                    sleep(3)

                step_started_at = perf_counter()
                parser = ParserFactory.get_parser(file_path)
                self._log_time("parser_select", step_started_at, timings)

                step_started_at = perf_counter()
                if "allow_api" in signature(parser.parse).parameters:
                    elements = parser.parse(
                        file_path,
                        text_only=text_only,
                        allow_api=allow_api,
                    )
                elif "text_only" in signature(parser.parse).parameters:
                    elements = parser.parse(file_path, text_only=text_only)
                else:
                    elements = parser.parse(file_path)
                self._log_time("parse", step_started_at, timings)

                if elements:
                    cache_path = self._write_parsed_cache(file_path, elements, text_only)
            else:
                print("[Cache] API call skipped; using parsed elements from cache.")

            parsed_before_filter_count = len(elements)
            if text_only:
                elements = self._filter_text_media_only(elements)
                media_excluded_count = parsed_before_filter_count - len(elements)
                elements, toc_pages = self._mark_toc_pages(elements)
                toc_element_count = sum(1 for element in elements if element.get("is_toc"))
                print(
                    "[Pipeline] Text-only parsed elements: "
                    f"{len(elements)} kept / {parsed_before_filter_count} parsed."
                )
                print(
                    "[Pipeline] Text-only excluded before chunking: "
                    f"media={media_excluded_count}, toc_elements={toc_element_count}, "
                    f"toc_pages={len(toc_pages)}."
                )

            if not elements:
                self._record_failure(file_path, "parse", "parser returned no elements")
                chunks = []
                embedded_chunks = []
                valid_chunks = []
            else:
                self._write_parsed_elements(file_path, elements, text_only=text_only)
                self._write_extracted(file_path, elements)

                if parse_only:
                    self._write_page_text_preview(file_path, elements)
                    self._write_page_text_full(file_path, elements)
                    chunks = []
                    embedded_chunks = []
                    valid_chunks = []
                    total_elapsed = perf_counter() - total_started_at
                    timings["total"] = round(total_elapsed, 3)
                    print(f"[Timing] total: {total_elapsed:.3f}s")
                    return {
                        "status": "success",
                        "parsed_count": len(elements),
                        "chunk_count": 0,
                        "embedded_target_count": 0,
                        "embedding_success_count": 0,
                        "limit_chunks": limit_chunks,
                        "text_only": text_only,
                        "parse_only": parse_only,
                        "chunk_only": chunk_only,
                        "no_embed": no_embed,
                        "embed": embed,
                        "allow_api": allow_api,
                        "force_api": force_api,
                        "from_parsed": from_parsed,
                        "reset_collection": reset_collection,
                        "loaded_from_cache": loaded_from_cache,
                        "cache_path": str(cache_path) if cache_path else None,
                        "timings": timings,
                    }

                elements_to_chunk = elements
                if text_only:
                    elements_to_chunk = self._filter_text_only(elements)
                    elements_to_chunk = self._clean_text_only_body(elements_to_chunk)
                    print(
                        "[Pipeline] Text-only body elements after TOC exclusion/cleaning: "
                        f"{len(elements_to_chunk)}"
                    )

                if not elements_to_chunk:
                    self._record_failure(
                        file_path,
                        "text_only_filter",
                        "no body text elements remained after TOC exclusion",
                    )
                    chunks = []
                    embedded_chunks = []
                    valid_chunks = []
                    self._write_chunks(file_path, chunks, text_only=text_only)
                    self._write_text_preview(file_path, chunks)
                    raise ValueError("No body text elements remained after text-only filtering.")

                step_started_at = perf_counter()
                chunks = self.chunker.chunk_documents(elements_to_chunk)
                self._log_time("chunk", step_started_at, timings)

                if text_only:
                    chunks = [
                        chunk for chunk in chunks
                        if not self._is_text_only_excluded(chunk)
                    ]
                    print(f"[Pipeline] Text-only chunks created: {len(chunks)}")

                chunks_to_embed = chunks
                if limit_chunks is not None:
                    chunks_to_embed = chunks[:limit_chunks]
                    print(
                        f"[PipelineManager] limit_chunks={limit_chunks}: "
                        f"using {len(chunks_to_embed)} of {len(chunks)} chunks."
                    )

                self._write_chunks(file_path, chunks_to_embed, text_only=text_only)
                self._write_text_preview(file_path, chunks_to_embed)

                if chunk_only or no_embed or not embed:
                    embedded_chunks = []
                    valid_chunks = []
                    total_elapsed = perf_counter() - total_started_at
                    timings["total"] = round(total_elapsed, 3)
                    print("[Pipeline] Chunk preview files saved.")
                    print("[Pipeline] Embedding and Qdrant insert skipped.")
                    print(f"[Timing] total: {total_elapsed:.3f}s")
                    return {
                        "status": "success",
                        "parsed_count": len(elements),
                        "chunk_count": len(chunks_to_embed),
                        "embedded_target_count": 0,
                        "embedding_success_count": 0,
                        "limit_chunks": limit_chunks,
                        "text_only": text_only,
                        "parse_only": parse_only,
                        "chunk_only": chunk_only,
                        "no_embed": no_embed,
                        "embed": embed,
                        "allow_api": allow_api,
                        "force_api": force_api,
                        "from_parsed": from_parsed,
                        "reset_collection": reset_collection,
                        "loaded_from_cache": loaded_from_cache,
                        "cache_path": str(cache_path) if cache_path else None,
                        "timings": timings,
                    }

                step_started_at = perf_counter()
                embedded_chunks = self.embedder.embed_chunks(chunks_to_embed)
                self._log_time("embed", step_started_at, timings)

                valid_chunks = [
                    chunk for chunk in embedded_chunks
                    if chunk.get("vector")
                ]

                step_started_at = perf_counter()
                if valid_chunks:
                    vector_size = len(valid_chunks[0]["vector"])
                    if reset_collection:
                        self.qdrant.reset_collection(vector_size=vector_size)
                    else:
                        self.qdrant.create_collection_if_not_exists(vector_size=vector_size)
                    self.qdrant.insert_chunks(valid_chunks, source_file=file_path)
                else:
                    self._record_failure(file_path, "embed", "no embeddings were created")
                    print("[PipelineManager] No embeddings were created. Skipping Qdrant insert.")
                self._log_time("qdrant", step_started_at, timings)

            total_elapsed = perf_counter() - total_started_at
            timings["total"] = round(total_elapsed, 3)
            print(f"[Timing] total: {total_elapsed:.3f}s")

            return {
                "status": "success" if elements else "failed",
                "parsed_count": len(elements),
                "chunk_count": len(chunks),
                "embedded_target_count": len(embedded_chunks),
                "embedding_success_count": len(valid_chunks),
                "limit_chunks": limit_chunks,
                "text_only": text_only,
                "parse_only": parse_only,
                "chunk_only": chunk_only,
                "no_embed": no_embed,
                "embed": embed,
                "allow_api": allow_api,
                "force_api": force_api,
                "from_parsed": from_parsed,
                "reset_collection": reset_collection,
                "loaded_from_cache": loaded_from_cache,
                "cache_path": str(cache_path) if cache_path else None,
                "timings": timings,
            }

        except Exception as e:
            self._record_failure(file_path, "pipeline", str(e))
            total_elapsed = perf_counter() - total_started_at
            timings["total"] = round(total_elapsed, 3)
            return {
                "status": "failed",
                "error": str(e),
                "text_only": text_only,
                "parse_only": parse_only,
                "chunk_only": chunk_only,
                "no_embed": no_embed,
                "embed": embed,
                "allow_api": allow_api,
                "force_api": force_api,
                "from_parsed": from_parsed,
                "reset_collection": reset_collection,
                "timings": timings,
            }
