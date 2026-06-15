import base64

from core.config import OPENAI_API_KEY


class VlmProcessor:
    """실제 VLM API 호출을 담당하는 저수준 processor.

    Parser는 이 클래스를 직접 다루지 않고 `VisionParser`를 통해 사용한다.
    현재는 깨진 표 이미지를 Markdown table로 복구하는 기능만 있다.
    """

    def __init__(self):
        if not OPENAI_API_KEY:
            raise ValueError("[VLM] OPENAI_API_KEY is not set.")

        try:
            # openai 패키지는 깨진 표/이미지 복구가 필요할 때만 요구된다.
            from openai import OpenAI
        except ImportError as exc:
            raise ImportError(
                "[VLM] The openai package is required for table recovery. "
                "Install it or avoid VLM table recovery."
            ) from exc

        self.client = OpenAI(api_key=OPENAI_API_KEY)
        self.model = "gpt-4o-mini"

    def encode_image(self, image_path: str) -> str:
        """이미지 파일을 OpenAI image_url 입력에 넣을 base64 문자열로 변환한다."""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")

    def table_to_markdown(self, image_path: str) -> str:
        """표 crop 이미지를 읽고 Markdown table만 반환하도록 요청한다."""
        print("\n[VLM] Recovering a broken table image with GPT vision...")

        base64_image = self.encode_image(image_path)
        prompt = """You are a document table recovery specialist.
The attached image is a cropped table region from a PDF document.
Read the table accurately and output only a Markdown table.
Do not include explanations, greetings, code fences, or summaries.
If cells are merged or ambiguous, reconstruct the most natural table structure."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                },
                            },
                        ],
                    }
                ],
                max_tokens=1500,
                temperature=0.0,
            )

            markdown = response.choices[0].message.content.strip()
            print("[VLM] Table recovery complete.")
            return markdown

        except Exception as e:
            print(f"[VLM] Table recovery failed: {e}")
            return ""
