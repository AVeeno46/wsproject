import os
import re
from html import unescape

import fitz  # PyMuPDF: PDF 특정 영역을 이미지로 crop할 때 사용한다.

from parsers.base_parser import BaseParser
from parsers.table_parser import TableParser
from parsers.upstage_parser import UpstageParser
from parsers.vision_parser import VisionParser
from processors.text_cleaner import TextCleaner


TEXT_ONLY_EXCLUDED_TYPES = {"image", "figure", "chart"}
TOC_CATEGORY_TYPES = {"index", "toc", "table_of_contents"}


class PdfParser(BaseParser):
    """PDF 문서를 Upstage 결과 기반의 표준 element 리스트로 변환하는 Parser.

    이 클래스의 역할:
    - UpstageParser로 PDF 문서 구조 분석 결과를 받는다.
    - Upstage elements를 순회하면서 text/table을 구분한다.
    - 각 element에 element_index를 붙여 원본 추출 순서를 보존한다.
    - 깨진 table은 PDF에서 해당 좌표를 crop한 뒤 VisionParser에 복구를 맡긴다.

    이미지/그래프 설명 추출은 아직 여기서 하지 않는다.
    """

    def __init__(self):
        # Upstage API 호출, table 정리, VLM 처리를 각각 전담 객체로 분리한다.
        self.upstage = UpstageParser()
        self.tables = TableParser()
        self.vision = VisionParser()

    def _is_text_only_excluded(self, category: str) -> bool:
        """Return True when an Upstage element should be skipped in text-only mode."""
        category_lower = str(category or "").lower()
        return any(excluded in category_lower for excluded in TEXT_ONLY_EXCLUDED_TYPES)

    def _looks_like_toc(self, text: str, category: str = "") -> bool:
        """Detect table-of-contents/layout text that should not be embedded as body text."""
        if not text:
            return False

        normalized = re.sub(r"\s+", " ", text)
        category_lower = str(category or "").lower()
        is_table_like = category_lower == "table"

        if category_lower in TOC_CATEGORY_TYPES:
            return True

        if "목 차" in normalized or "목차" in normalized:
            return True

        # Dot/dash leaders are common in table-of-contents rows.
        leader_count = len(re.findall(r"\.{4,}|·{3,}|-{4,}", normalized))
        if leader_count >= 2:
            return True

        # Tables often contain many labels and numbers, so page-number-like patterns alone
        # are too weak for table_text. Keep table content unless a strong TOC signal exists.
        if is_table_like:
            return False

        # Repeated "title + page number" patterns usually mean TOC entries.
        toc_entry_count = len(
            re.findall(
                r"(?:^|\s)(?:\d+(?:\.\d+)*\.?\s*)?[가-힣A-Za-z][^.\n]{3,80}\s+\d{1,3}(?=\s|$)",
                normalized,
            )
        )
        return toc_entry_count >= 4

    def _table_to_plain_text(self, table_text: str) -> str:
        """Convert Upstage table markdown/html/text into plain text without VLM recovery."""
        if not table_text:
            return ""

        text = unescape(str(table_text))
        text = re.sub(r"</(tr|p|div|li|h[1-6])\s*>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"</t[dh]\s*>", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)

        # Keep row-ish line breaks, but remove markdown table borders/noisy separators.
        cleaned_lines = []
        for line in text.splitlines():
            line = line.replace("|", " ")
            line = re.sub(r"^\s*[-:\s]{3,}\s*$", "", line)
            line = re.sub(r"[ \t]+", " ", line).strip()
            if line:
                cleaned_lines.append(line)

        return self.clean_text("\n".join(cleaned_lines))

    def _clean_common(self, text: str) -> str:
        """BaseParser 정제 뒤 공통 후처리 규칙을 적용한다."""
        return TextCleaner.clean_common(self.clean_text(text))

    def recover_table(
        self,
        file_path: str,
        page_num: int,
        coordinates: list,
        upstage_width: float,
        upstage_height: float,
    ) -> str:
        """깨진 표 영역을 PDF에서 crop한 뒤 VLM으로 Markdown table 복구를 시도한다.

        Upstage가 주는 table coordinates는 Upstage 기준 좌표계일 수 있다.
        실제 PDF 페이지 크기와 Upstage page 크기를 비교해 PyMuPDF 좌표계로
        변환한 뒤 해당 영역만 이미지로 저장한다.
        """
        doc = None
        temp_img_path = None

        try:
            # PyMuPDF page index는 0부터 시작하고, Upstage page 번호는 보통 1부터 시작한다.
            doc = fitz.open(file_path)
            page_index = max(0, page_num - 1)
            if page_index >= len(doc):
                page_index = len(doc) - 1

            page = doc[page_index]

            if not coordinates:
                print("[PdfParser] Table coordinates are empty.")
                return ""

            # coordinates는 보통 네 꼭짓점 dict 리스트다.
            # 예: [{"x": 0.1, "y": 0.2}, ...]
            x_coords = [float(pt.get("x", 0)) for pt in coordinates]
            y_coords = [float(pt.get("y", 0)) for pt in coordinates]

            # 꼭짓점 좌표에서 사각형의 좌상단/우하단을 만든다.
            ux0, uy0 = min(x_coords), min(y_coords)
            ux1, uy1 = max(x_coords), max(y_coords)

            page_rect = page.rect
            pdf_width = page_rect.width
            pdf_height = page_rect.height

            # 좌표가 0~1 사이면 normalized 좌표로 보고 PDF page 크기를 곱한다.
            is_normalized = (
                0 <= ux0 <= 1
                and 0 <= ux1 <= 1
                and 0 <= uy0 <= 1
                and 0 <= uy1 <= 1
            )

            if is_normalized:
                x0 = ux0 * pdf_width
                y0 = uy0 * pdf_height
                x1 = ux1 * pdf_width
                y1 = uy1 * pdf_height
            else:
                # 좌표가 pixel/point 기준이면 Upstage page 크기 대비 PDF page 크기 비율로 변환한다.
                x_scale = pdf_width / upstage_width if upstage_width else 1.0
                y_scale = pdf_height / upstage_height if upstage_height else 1.0
                x0 = ux0 * x_scale
                y0 = uy0 * y_scale
                x1 = ux1 * x_scale
                y1 = uy1 * y_scale

            # OCR 좌표가 너무 딱 맞으면 표 선이나 글자가 잘릴 수 있어 약간 여백을 둔다.
            margin = 8.0
            rect = fitz.Rect(
                x0 - margin,
                y0 - margin,
                x1 + margin,
                y1 + margin,
            )
            rect = rect & page_rect

            if rect.is_empty or rect.width <= 1 or rect.height <= 1:
                print(f"[PdfParser] Invalid crop rect: {rect}")
                return ""

            # VLM에 보낼 임시 crop 이미지 파일을 만든다.
            temp_img_path = f"temp_table_crop_p{page_num}_{id(rect)}.png"
            pix = page.get_pixmap(dpi=300, clip=rect, alpha=False)
            pix.save(temp_img_path)

            print(
                f"[PdfParser] Cropped table on page {page_num} "
                f"/ normalized={is_normalized}"
            )

            # 실제 VLM 호출은 VisionParser가 담당한다.
            return self.vision.table_to_markdown(temp_img_path)

        except Exception as e:
            print(f"[PdfParser] Table VLM recovery failed: {e}")
            return ""

        finally:
            # 임시 crop 이미지는 복구 시도 후 바로 삭제한다.
            if temp_img_path and os.path.exists(temp_img_path):
                os.remove(temp_img_path)
            if doc:
                doc.close()

    def parse(
        self,
        file_path: str,
        text_only: bool = False,
        allow_api: bool = False,
    ) -> list:
        """PDF를 page/type/content/element_index를 가진 element 리스트로 만든다."""
        self.validate_file(file_path)

        # 1. PDF를 Upstage에 보내고 구조화된 JSON 결과를 받는다.
        if not allow_api:
            print("[PdfParser] API calls are disabled. Use cached parsed elements or --allow-api.")
            return []

        result = self.upstage.parse(file_path)
        if not result:
            return []

        try:
            extracted_elements = []

            # 2. Upstage element 순서를 그대로 보존하기 위해 enumerate(start=1)를 사용한다.
            #    이 값은 processed/parsed_elements.jsonl, chunks.jsonl, Qdrant payload까지 이어진다.
            for element_index, element in enumerate(result.get("elements", []), start=1):
                page_num = element.get("page", 1)
                category = element.get("category", "paragraph")

                # Text-only mode is for checking the body-text ingestion path first.
                # Skipping image/figure/chart here keeps visual interpretation out of this mode.
                # Tables are still kept as plain text below because many reports put body text in boxes.
                # from running while keeping the existing table/VLM code available.
                if text_only and self._is_text_only_excluded(category):
                    continue

                if category == "table":
                    # 3-A. table element는 TableParser가 Markdown 후보를 꺼내고 정규화한다.
                    md_text = self.tables.to_markdown(element)

                    if text_only:
                        raw_table_text = self._table_to_plain_text(md_text)
                        table_text = self._clean_common(raw_table_text)
                        markdown_table = self.tables.html_to_markdown(md_text)
                        if table_text:
                            is_toc = self._looks_like_toc(table_text, "table")
                            extracted_elements.append(
                                {
                                    "page": page_num,
                                    "type": "toc" if is_toc else "table_text",
                                    "content": table_text,
                                    "raw_content": raw_table_text,
                                    "element_index": element_index,
                                    "is_toc": is_toc,
                                    "original_type": "table",
                                    "raw_table": md_text,
                                    "markdown_table": markdown_table,
                                }
                            )
                        continue

                    # 표 텍스트가 깨졌다고 판단되면 PDF crop -> VLM 복구 루트로 보낸다.
                    if self.tables.is_broken(md_text):
                        print(
                            f"\n[PdfParser] Broken table detected on page {page_num}. "
                            "Starting VLM recovery."
                        )

                        coordinates = element.get("coordinates", [])
                        if coordinates:
                            # Upstage page 크기는 좌표 변환에 필요하다.
                            # 응답에 없으면 기본 추정값을 사용한다.
                            upstage_w = 1700.0
                            upstage_h = 2200.0

                            if "pages" in result and len(result["pages"]) >= page_num:
                                page_info = result["pages"][page_num - 1]
                                upstage_w = float(page_info.get("width", 1700))
                                upstage_h = float(page_info.get("height", 2200))

                            vlm_result = self.recover_table(
                                file_path=file_path,
                                page_num=page_num,
                                coordinates=coordinates,
                                upstage_width=upstage_w,
                                upstage_height=upstage_h,
                            )
                            if vlm_result:
                                md_text = vlm_result

                    if md_text:
                        extracted_elements.append(
                            {
                                "page": page_num,
                                "type": "table",
                                "content": md_text,
                                "element_index": element_index,
                                "is_toc": False,
                            }
                        )

                else:
                    # 3-B. table이 아닌 element는 markdown/text/html 후보에서 텍스트를 꺼낸다.
                    text = ""
                    content = element.get("content")
                    if isinstance(content, dict):
                        text = (
                            content.get("markdown")
                            or content.get("text")
                            or content.get("html")
                            or ""
                        )
                    else:
                        text = str(content or "")

                    # html 태그가 섞여 있으면 제거하고, 공통 clean_text를 적용한다.
                    text = re.sub(r"<[^>]+>", "", text)
                    raw_text = self.clean_text(text)
                    cleaned = self._clean_common(raw_text)

                    if cleaned:
                        is_toc = self._looks_like_toc(cleaned, category)
                        extracted_elements.append(
                            {
                                "page": page_num,
                                "type": "toc" if is_toc else category,
                                "content": cleaned,
                                "raw_content": raw_text,
                                "element_index": element_index,
                                "is_toc": is_toc,
                            }
                        )

            print(f"[PdfParser] Extracted {len(extracted_elements)} structured elements.")
            return extracted_elements

        except Exception as e:
            print(f"[PdfParser] Failed to normalize parsed elements: {e}")
            return []
