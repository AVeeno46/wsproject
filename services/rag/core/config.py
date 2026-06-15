import os

from dotenv import load_dotenv


# 프로젝트 루트의 .env 파일을 읽어 환경 변수를 로드한다.
load_dotenv()

# --- 인프라 / 네트워크 설정 ---
# Ollama는 로컬 LLM/embedding 서버다.
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Qdrant는 벡터 DB다.
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))

# gRPC 서버를 구현할 때 사용할 예정인 포트다.
GRPC_PORT = int(os.getenv("GRPC_PORT", 50052))

# --- AI 모델 설정 ---
# LLM_MODEL은 검색 결과를 바탕으로 답변을 생성할 때 사용할 모델이다.
LLM_MODEL = os.getenv("LLM_MODEL", "exaone3.5:8b")

# EMBED_MODEL은 chunk를 벡터로 바꿀 때 사용할 Ollama embedding 모델이다.
EMBED_MODEL = os.getenv("EMBED_MODEL", "bge-m3")

# --- 외부 VLM / LLM 설정 ---
# 깨진 표, 이미지, 그래프를 VLM으로 복구하거나 해석할 때 사용한다.
EXTERNAL_LLM_ENABLED = os.getenv("EXTERNAL_LLM_ENABLED", "false").lower() == "true"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
EXTERNAL_LLM_MODEL = os.getenv("EXTERNAL_LLM_MODEL", "gpt-4o-mini")

# --- 청킹 설정 ---
# CHUNK_SIZE는 일반 텍스트 chunk 하나의 목표 최대 길이다.
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 600))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))

# --- 문서 파싱 API 설정 ---
# Upstage Document Parse API key다.
UPSTAGE_API_KEY = os.getenv("UPSTAGE_API_KEY", "")

# --- Qdrant collection 설정 ---
# chunk vector들이 저장될 collection 이름이다.
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "wusong_rules")
