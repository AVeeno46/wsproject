import json
import os
from datetime import datetime

import httpx

from core.config import UPSTAGE_API_KEY


class UpstageParser:
    """Upstage Document Parse API 호출 전담 클래스.

    PDF/HWPX 등 입력 포맷과 상관없이 Upstage에 문서를 보내고 원본 JSON을
    받아오는 책임만 가진다. 각 파일 형식별 Parser는 이 결과를 받아 자기
    형식에 맞게 표준 element로 변환한다.
    """

    def __init__(self):
        self.api_url = "https://api.upstage.ai/v1/document-ai/document-parse"
        self.headers = {"Authorization": f"Bearer {UPSTAGE_API_KEY}"}
        self.timeout = float(os.getenv("UPSTAGE_TIMEOUT", "180"))

    def parse(self, file_path: str) -> dict:
        """문서 파일을 Upstage에 전송하고 응답 JSON dict를 반환한다."""
        if not UPSTAGE_API_KEY:
            print("[UpstageParser] UPSTAGE_API_KEY is not set.")
            return {}

        print("\n[UpstageParser] Starting document parse...")

        try:
            # Upstage Document Parse는  파일 업로드형 형식 multipart/form-data로 문서를 받는다.
            with open(file_path, "rb") as f:  #바이너리 파일로 열기
                response = httpx.post(
                    self.api_url,
                    headers=self.headers,
                    files={"document": f},  #document라는 이름으로 PDF 파일을 첨부해서 보낸다
                    timeout=self.timeout,
                )

            response.raise_for_status() #  HTTP 응답이 실패 상태면 예외 발생하고 except 블록으로 넘어간다.
            result = response.json()  #JSON 응답을 Python 딕셔너리로 바꿈

            # 디버깅을 위해 원본 응답을 저장한다.
            # 이후 table/text/image element 구조를 확인할 때 이 파일을 보면 된다.
            os.makedirs("debug", exist_ok=True)
            with open("debug/upstage_response.json", "w", encoding="utf-8") as json_file:
                json.dump(result, json_file, indent=4, ensure_ascii=False)   #Python dict를 JSON 파일로 저장 /  저장할 데이터, 저장할 파일 객체, 들여쓰기, 유니코드 문자 그대로 저장

            print("[UpstageParser] Saved raw response: debug/upstage_response.json")
            return result  #PdfParser가 받아서 후처리함
 
        except Exception as e:
            print(f"[UpstageParser] Document parse failed: {e}")
            os.makedirs("debug", exist_ok=True)
            error_payload = {
                "failed_at": datetime.now().isoformat(timespec="seconds"),
                "file_path": file_path,
                "error_type": e.__class__.__name__,
                "error": str(e),
            }
            if isinstance(e, httpx.HTTPStatusError):
                error_payload["status_code"] = e.response.status_code
                error_payload["response_text"] = e.response.text[:2000]

            with open("debug/upstage_error.json", "w", encoding="utf-8") as json_file:
                json.dump(error_payload, json_file, indent=2, ensure_ascii=False)
            print("[UpstageParser] Saved error details: debug/upstage_error.json")
            return {}
