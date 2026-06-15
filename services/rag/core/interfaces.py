"""공통 인터페이스를 둘 자리.

현재는 `parsers.base_parser.BaseParser`만 실제 ABC로 사용하고 있다.
나중에 Embedder, VectorRepository, Retriever를 교체 가능하게 만들고 싶으면
이 파일에 Protocol 또는 ABC를 추가하면 된다.
"""
