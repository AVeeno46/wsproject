from core.config import CHUNK_SIZE
from processors.table_chunker import MAX_TABLE_CHARS, TableChunker


class Chunker:
    """파싱된 element 리스트를 Qdrant에 넣기 전 chunk 리스트로 바꾸는 클래스.

    Parser가 만든 element는 문서 구조 단위다.
    예:
        {"page": 1, "type": "paragraph", "content": "...", "element_index": 3}
        {"page": 1, "type": "table", "content": "| ... |", "element_index": 4}

    Chunker는 이 element들을 임베딩하기 좋은 단위로 묶는다.
    중요한 정책:
    - table은 text와 섞지 않고 무조건 단독 chunk로 유지한다.
    - page가 바뀌면 기존 text chunk를 끊는다.
    - text는 CHUNK_SIZE를 넘지 않도록 여러 element를 모아 chunk로 만든다.
    - 디버깅을 위해 chunk가 어떤 element에서 왔는지 element_indexes에 남긴다.
    """

    def __init__(self, chunk_size=CHUNK_SIZE):
        # 기본값은 core/config.py의 CHUNK_SIZE를 사용한다.
        # 학교 요구사항에 맞춰 기본 600자로 설정되어 있다.
        self.chunk_size = chunk_size
        self.table_chunker = TableChunker()

    def _flush_text_chunk(
        self,
        chunked_data: list,
        page: int,
        chunk_id: int,
        content: str,
        element_indexes: list,
    ) -> int:
        """현재까지 모아둔 text chunk를 결과 리스트에 넣는다.

        text element들은 여러 개를 이어붙이다가 table을 만나거나 page가 바뀌거나
        chunk_size를 넘기면 여기서 하나의 text chunk로 배출된다.

        Args:
            chunked_data: 최종 chunk들이 쌓이는 리스트
            page: 이 text chunk가 속한 page
            chunk_id: 현재 부여할 chunk 번호
            content: 지금까지 모은 text
            element_indexes: 이 chunk를 구성한 원본 element 순번들

        Returns:
            다음 chunk에 사용할 chunk_id
        """
        if content.strip():
            chunked_data.append(
                {
                    "page": page,
                    "page_number": page,
                    "page_label": f"page-{page}",
                    "is_first_page": page == 1,
                    "chunk_id": chunk_id,
                    "chunk_order": chunk_id,
                    "document_order": chunk_id,
                    "type": "text",
                    "element_indexes": element_indexes[:],
                    "content": content.strip(),
                }
            )
            return chunk_id + 1

        return chunk_id

    def chunk_documents(self, parsed_elements: list) -> list:
        """표준 element 리스트를 text/table chunk 리스트로 변환한다."""
        print("\n[Chunker] Starting structured chunking...")

        chunked_data = []

        # current_text/current_indexes는 아직 chunk로 확정되지 않은 text 묶음이다.
        current_text = ""
        current_indexes = []
        current_page = 1
        chunk_id = 1

        for element in parsed_elements:
            element_type = element["type"]
            element_page = element["page"]
            element_index = element.get("element_index")

            # table/table_text를 만나거나 page가 바뀌면, 지금까지 모아둔 text를 먼저 저장한다.
            # 이렇게 해야 text chunk와 table 계열 chunk가 섞이지 않고, page 경계도 보존된다.
            if element_type in {"table", "table_text"} or element_page != current_page:
                chunk_id = self._flush_text_chunk(
                    chunked_data,
                    current_page,
                    chunk_id,
                    current_text,
                    current_indexes,
                )
                current_text = ""
                current_indexes = []

            # table_text는 text-only 모드에서 table을 plain text로 바꾼 결과다.
            # 일반 본문 text와 구분되도록 독립 chunk로 저장하고 type도 유지한다.
            if element_type in {"table", "table_text"}:
                content = element["content"]

                # 지금 단계에서는 큰 표를 자르지 않는다.
                # 대신 너무 큰 표가 들어왔는지만 로그로 알려줘서 후속 개선 지점을 찾는다.
                if element_type == "table" and len(content) > 3000:
                    print(
                        "[Chunker] Large table chunk detected "
                        f"(page={element_page}, element_index={element_index}, "
                        f"length={len(content)})"
                    )

                if element_type == "table_text" and len(content) > MAX_TABLE_CHARS:
                    print(
                        "[Chunker] Large table_text chunk detected. Splitting into child chunks "
                        f"(page={element_page}, element_index={element_index}, "
                        f"length={len(content)})"
                    )
                    parent_chunk_id = chunk_id
                    table_parts = self.table_chunker.split_table_element(
                        element,
                        parent_chunk_id=parent_chunk_id,
                    )
                    for table_part in table_parts:
                        chunked_data.append(
                            {
                                "page": element_page,
                                "page_number": element_page,
                                "page_label": f"page-{element_page}",
                                "is_first_page": element_page == 1,
                                "chunk_id": chunk_id,
                                "chunk_order": chunk_id,
                                "document_order": chunk_id,
                                "type": table_part.get("type", "table_text_child"),
                                "original_type": element.get("original_type"),
                                "parent_type": table_part.get("parent_type"),
                                "parent_chunk_id": table_part.get("parent_chunk_id", parent_chunk_id),
                                "parent_element_indexes": table_part.get(
                                    "parent_element_indexes",
                                    [element_index] if element_index is not None else [],
                                ),
                                "parent_page": table_part.get("parent_page", element_page),
                                "section_title": table_part.get("section_title"),
                                "element_indexes": [element_index] if element_index is not None else [],
                                "raw_content": table_part.get("raw_content"),
                                "raw_table": table_part.get("raw_table"),
                                "markdown_table": table_part.get("markdown_table"),
                                "content": table_part.get("content", ""),
                            }
                        )
                        chunk_id += 1
                    current_page = element_page
                    continue

                chunked_data.append(
                    {
                        "page": element_page,
                        "page_number": element_page,
                        "page_label": f"page-{element_page}",
                        "is_first_page": element_page == 1,
                        "chunk_id": chunk_id,
                        "chunk_order": chunk_id,
                        "document_order": chunk_id,
                        "type": element_type,
                        "original_type": element.get("original_type"),
                        "element_indexes": [element_index] if element_index is not None else [],
                        "raw_content": element.get("raw_content"),
                        "raw_table": element.get("raw_table"),
                        "markdown_table": element.get("markdown_table"),
                        "content": content,
                    }
                )
                chunk_id += 1
                current_page = element_page
                continue

            # table이 아닌 element는 text 후보로 본다.
            text_to_add = element["content"]

            # 새 text를 붙이면 chunk_size를 넘는 경우, 기존 text를 먼저 저장하고
            # 현재 element부터 새 text chunk를 시작한다.
            if len(current_text) + len(text_to_add) > self.chunk_size and current_text:
                chunk_id = self._flush_text_chunk(
                    chunked_data,
                    current_page,
                    chunk_id,
                    current_text,
                    current_indexes,
                )
                current_text = text_to_add
                current_indexes = [element_index] if element_index is not None else []
                current_page = element_page
            else:
                # 같은 text chunk 안에서는 element 사이에 줄바꿈을 넣어서
                # 원문 문단 경계가 완전히 사라지지 않게 한다.
                if current_text:
                    current_text += "\n" + text_to_add
                else:
                    current_text = text_to_add
                    current_page = element_page

                if element_index is not None:
                    current_indexes.append(element_index)

        # 마지막으로 남아 있는 text chunk를 저장한다.
        self._flush_text_chunk(
            chunked_data,
            current_page,
            chunk_id,
            current_text,
            current_indexes,
        )

        print(f"[Chunker] Created {len(chunked_data)} chunks.")
        return chunked_data
