from parsers.base_parser import BaseParser


class HwpxParser(BaseParser):
    """HWPX 문서 파서를 위한 자리.

    나중에 구현할 때도 PdfParser와 같은 표준 element 리스트를 반환해야 한다.

    반환 예:
        [
            {"page": 1, "type": "paragraph", "content": "..."},
            {"page": 1, "type": "table", "content": "| ... |"},
        ]

    이렇게 맞춰두면 Chunker, Embedder, QdrantRepository는 PDF/HWPX 차이를
    몰라도 그대로 동작한다.
    """

    def parse(self, file_path: str) -> list:
        self.validate_file(file_path)
        raise NotImplementedError("HWPX 파서는 아직 구현되지 않았습니다.")
