"""파이프라인 표준 데이터 구조를 둘 자리.

현재 코드는 dict 기반으로 빠르게 MVP를 구성하고 있다.
나중에 타입 안정성을 높이고 싶으면 아래 구조를 dataclass로 정의하면 좋다.

예:
    ParsedElement(page: int, type: str, content: str)
    Chunk(page: int, chunk_id: int, type: str, content: str)
    EmbeddedChunk(page: int, chunk_id: int, type: str, content: str, vector: list[float])
"""
