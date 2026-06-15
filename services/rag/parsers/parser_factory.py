import os

from parsers.hwpx_parser import HwpxParser
from parsers.pdf_parser import PdfParser


class ParserFactory:
    """파일 확장자에 맞는 Parser 객체를 만들어주는 간단한 라우터."""

    @staticmethod
    def get_parser(file_path: str):
        # 확장자는 대소문자 차이를 없애고 비교한다.
        ext = os.path.splitext(file_path)[1].lower()

        if ext == ".pdf":
            return PdfParser()

        if ext == ".hwpx":
            return HwpxParser()

        raise ValueError(f"지원하지 않는 파일 형식입니다: {ext}")
