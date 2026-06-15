import os
import re  #정규표현식 모듈
from abc import ABC, abstractmethod


class BaseParser(ABC): #상속용 기본 클래스
    """모든 문서 Parser가 공유하는 최소 공통 기능.

    PdfParser와 HwpxParser는 이 클래스를 상속해서 `parse()`를 구현한다.
    PipelineManager는 구체 타입을 몰라도 `parse(file_path)`만 호출하면 된다.
    """

    @abstractmethod   #자식 클래스에서 반드시 구현해야하는 메서드임
    def parse(self, file_path: str) -> list:
        """문서를 표준 element 리스트로 변환한다."""
        pass

    def validate_file(self, file_path: str):
        """문서 파일이 실제로 존재하는지 확인한다."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"파일이 존재하지 않습니다: {file_path}")
        print(f"[{self.__class__.__name__}] File ready: {file_path}")  #객체의 클래스 이름을 가져오ㅁ , 파일 경로

    def clean_text(self, raw_text: str) -> str:
        """공통 텍스트 정제.

        현재는 연속 공백/탭만 정리한다. 줄바꿈은 문서 구조 정보가 될 수 있어서
        무리하게 제거하지 않는다.
        """
        if not raw_text:
            return ""

        cleaned = re.sub(r"[ \t]+", " ", raw_text)
        return cleaned.strip()
