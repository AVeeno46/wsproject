# Ingestion Pipeline Flow

이 문서는 로컬 테스트 명령 `python -m tests.test_run` 기준의 전체 흐름을 설명한다.



## 역할 요약

- `PipelineManager`: 파싱, 청킹, 임베딩, 적재 순서를 관리한다.
- `ParserFactory`: 확장자를 보고 `PdfParser` 또는 `HwpxParser`를 선택한다.
- `PdfParser`: PDF 전용 처리, Upstage 결과 표준화, PDF 좌표 기반 표 crop을 담당한다.
- `UpstageParser`: Upstage API 호출과 원본 JSON 저장만 담당한다.
- `TableParser`: table element에서 Markdown을 추출하고 깨진 표인지 판단한다.
- `VisionParser`: parser들이 공통으로 사용하는 vision/VLM 인터페이스다.
- `VlmProcessor`: 실제 OpenAI VLM 호출을 담당한다.
- `Chunker`: 표준 element를 임베딩하기 좋은 chunk 단위로 묶는다.
- `Embedder`: Ollama embedding API로 chunk를 벡터화한다.
- `QdrantRepository`: collection 생성과 vector upsert를 담당한다.
