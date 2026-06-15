from processors.vlm_processor import VlmProcessor


class VisionParser:
    """Parser 계층에서 공통으로 쓰는 vision/VLM 인터페이스.

    PdfParser/HwpxParser가 직접 OpenAI client를 알 필요가 없도록 중간에서
    감싸준다. 나중에 그래프 해석, 이미지 설명, 도식 OCR 같은 기능도 여기에
    메서드로 추가하면 된다.
    """

    def __init__(self):
        # VLM은 API key와 외부 패키지가 필요하므로 실제로 쓸 때만 생성한다.
        self.vlm = None

    def _get_vlm(self) -> VlmProcessor:
        """VlmProcessor를 lazy loading(필요할 때까지 객체 생성을 미루는 방식)으로 생성한다."""
        if self.vlm is None:
            self.vlm = VlmProcessor()
        return self.vlm

    def table_to_markdown(self, image_path: str) -> str:
        """깨진 표 crop 이미지를 Markdown table로 복구한다."""
        return self._get_vlm().table_to_markdown(image_path)
