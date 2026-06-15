import re


class TextCleaner:
    """공통 PDF 텍스트 후처리 규칙.

    문서명/페이지/기관명에 의존하지 않는 약한 규칙만 둔다.
    원문 의미를 바꾸기보다 줄 단위 잡음과 명확한 OCR 붙임 현상을 줄이는 용도다.
    """

    PAGE_MARK_RE = re.compile(r"^(?:\d{1,3}\s*[●■•]|[●■•]\s*\d{1,3})$")

    @classmethod
    def clean_common(cls, text: str) -> str:
        """여러 PDF에 공통으로 적용 가능한 안전한 텍스트 정제."""
        if not text:
            return ""

        text = text.replace("\r\n", "\n").replace("\r", "\n")

        cleaned_lines = []
        for line in text.split("\n"):
            line = re.sub(r"[ \t]+", " ", line).strip()
            if not line:
                continue

            # 줄 전체가 페이지 번호/꼬리말 표식일 때만 제거한다.
            if cls.PAGE_MARK_RE.fullmatch(line):
                continue

            # 앞 문장에 붙어버린 "- (항목)"은 새 항목으로 분리한다.
            line = re.sub(r"\s*-\s+(\()", r"\n- \1", line)

            # 쉼표 뒤가 문자일 때만 공백을 보정한다. 숫자 천 단위 콤마는 건드리지 않는다.
            line = re.sub(r",(?=[^\W\d_])", ", ", line)

            parts = [
                re.sub(r"[ \t]+", " ", part).strip()
                for part in line.split("\n")
            ]
            cleaned_lines.extend(part for part in parts if part)

        return "\n".join(cleaned_lines).strip()
