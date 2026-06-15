import httpx
from qdrant_client import QdrantClient
from core.config import QDRANT_HOST, QDRANT_PORT, COLLECTION_NAME, OLLAMA_URL, EMBED_MODEL

class QdrantRetriever:
    def __init__(self):
        # DB와 Ollama 연결 설정
        self.client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        self.collection_name = COLLECTION_NAME
        self.ollama_url = f"{OLLAMA_URL}/api/embeddings"
        self.embed_model = EMBED_MODEL

    def _get_query_vector(self, query: str) -> list:
        """사용자의 질문(텍스트)을 DB와 동일한 모델(bge-m3)로 벡터화합니다."""
        try:
            response = httpx.post(
                self.ollama_url,
                json={"model": self.embed_model, "prompt": query},
                timeout=30.0
            )
            response.raise_for_status()
            return response.json().get("embedding", [])
        except Exception as e:
            print(f"[Retriever] ❌ 질문 임베딩 실패: {e}")
            return []

    def retrieve(self, query: str, top_k: int = 3) -> list:
        """질문과 가장 유사한 문서 조각을 top_k개 가져옵니다."""
        print(f"\n[Retriever] 🧠 질문 분석 중: '{query}'")
        
        # 1. 질문을 벡터로 변환
        query_vector = self._get_query_vector(query)
        if not query_vector:
            return []

        # 2. Qdrant DB에서 유사도 검색 (🚨 최신 버전 query_points 적용)
        print(f"[Retriever] 🔎 Qdrant DB에서 가장 관련된 상위 {top_k}개 청크를 찾습니다...")
        search_result = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=top_k
        )
        
        # 3. 결과 정리해서 반환 (최신 응답 구조인 .points 매핑)
        results = []
        hits = getattr(search_result, "points", search_result) 
        
        for hit in hits:
            results.append({
                "score": hit.score,           # 유사도 점수 (1.0에 가까울수록 정답)
                "payload": hit.payload        # 원본 데이터 (페이지, 내용 등)
            })
            
        return results