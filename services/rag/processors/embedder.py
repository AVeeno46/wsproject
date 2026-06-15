from time import perf_counter

import httpx

from core.config import EMBED_MODEL, OLLAMA_URL


class Embedder:
    """chunk content를 Ollama embedding vector로 변환하는 클래스."""

    def __init__(self):
        self.api_url = f"{OLLAMA_URL}/api/embeddings"
        self.model = EMBED_MODEL

    def embed_chunks(self, chunks: list) -> list:
        """chunk 리스트에 vector 필드를 추가해 반환한다.

        진행률은 로그가 너무 많아지지 않도록 10% 단위로 출력한다.
        """
        total_started_at = perf_counter()
        total = len(chunks)
        print(f"\n[Embedder] Starting embedding with model '{self.model}'...")
        print(f"[Embedder] Chunk count: {total}")

        if total == 0:
            return chunks

        try:
            httpx.get(OLLAMA_URL, timeout=5.0)
        except httpx.ConnectError:
            print(f"[Embedder] Cannot connect to Ollama server: {OLLAMA_URL}")
            return chunks

        next_progress = 10
        for index, chunk in enumerate(chunks, start=1):
            text = chunk["content"]

            try:
                response = httpx.post(
                    self.api_url,
                    json={
                        "model": self.model,
                        "prompt": text,
                    },
                    timeout=60.0,
                )
                response.raise_for_status()
                chunk["vector"] = response.json().get("embedding", [])

            except Exception as e:
                print(f"[Embedder] Failed to embed chunk {chunk['chunk_id']}: {e}")
                chunk["vector"] = []

            progress = int(index * 100 / total)
            if progress >= next_progress or index == total:
                print(f"[Embedder] progress {progress}% ({index}/{total})")
                while next_progress <= progress:
                    next_progress += 10

        total_elapsed = perf_counter() - total_started_at
        print(f"[Embedder] Processed {total} chunks in {total_elapsed:.3f}s.")
        return chunks
