import hashlib

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from core.config import COLLECTION_NAME, QDRANT_HOST, QDRANT_PORT


class QdrantRepository:
    """Repository for Qdrant collection creation and chunk upserts."""

    def __init__(self):
        self.client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
        self.collection_name = COLLECTION_NAME

    def _collection_exists(self) -> bool:
        collections = self.client.get_collections().collections
        return any(c.name == self.collection_name for c in collections)

    def create_collection_if_not_exists(self, vector_size: int = 1024):
        """Create the collection when it does not already exist."""
        if not self._collection_exists():
            print(f"[Qdrant] Creating collection: {self.collection_name}")
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                ),
            )
            print("[Qdrant] Collection created.")
        else:
            print(f"[Qdrant] Reusing collection: {self.collection_name}")

    def reset_collection(self, vector_size: int = 1024):
        """Delete the current collection, if present, then recreate it."""
        if self._collection_exists():
            print(f"[Qdrant] Reset requested. Deleting existing collection: {self.collection_name}")
            self.client.delete_collection(collection_name=self.collection_name)
        else:
            print(f"[Qdrant] Reset requested. Collection does not exist yet: {self.collection_name}")

        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE,
            ),
        )
        print(f"[Qdrant] Collection recreated: {self.collection_name}")

    def _make_point_id(self, source_file: str, chunk: dict) -> int:
        """Create a stable unsigned 64-bit point id from source and chunk data."""
        raw_id = "|".join(
            [
                str(source_file),
                str(chunk.get("page", "")),
                str(chunk.get("chunk_id", "")),
                str(chunk.get("content", "")),
            ]
        )
        digest = hashlib.sha256(raw_id.encode("utf-8")).hexdigest()
        return int(digest[:16], 16)

    def insert_chunks(self, embedded_chunks: list, source_file: str = "unknown"):
        """Convert embedded chunks to Qdrant points and upsert them."""
        print(f"\n[Qdrant] Inserting {len(embedded_chunks)} chunks...")

        points = []
        for chunk in embedded_chunks:
            if not chunk.get("vector"):
                continue

            payload = {
                "source_file": source_file,
                "page": chunk["page"],
                "page_number": chunk.get("page_number", chunk["page"]),
                "page_label": chunk.get("page_label"),
                "is_first_page": chunk.get("is_first_page"),
                "chunk_id": chunk["chunk_id"],
                "chunk_order": chunk.get("chunk_order"),
                "document_order": chunk.get("document_order"),
                "type": chunk.get("type"),
                "original_type": chunk.get("original_type"),
                "parent_type": chunk.get("parent_type"),
                "parent_chunk_id": chunk.get("parent_chunk_id"),
                "parent_element_indexes": chunk.get("parent_element_indexes", []),
                "parent_page": chunk.get("parent_page"),
                "section_title": chunk.get("section_title"),
                "element_indexes": chunk.get("element_indexes", []),
                "content": chunk["content"],
            }
            if chunk.get("raw_table"):
                payload["raw_table"] = chunk.get("raw_table")
            if chunk.get("markdown_table"):
                payload["markdown_table"] = chunk.get("markdown_table")

            point = PointStruct(
                id=self._make_point_id(source_file, chunk),
                vector=chunk["vector"],
                payload=payload,
            )
            points.append(point)

        if points:
            self.client.upsert(
                collection_name=self.collection_name,
                points=points,
            )
            print("[Qdrant] Insert complete.")
        else:
            print("[Qdrant] No valid vectors to insert.")
