from retrievers.retriever import QdrantRetriever
from generators.llm_generator import OllamaGenerator

print("🚀 [최종 RAG 챗봇 파이프라인 가동]")

# 1. 모듈 소환
retriever = QdrantRetriever()
# 💡 만약 로컬에 llama3가 아닌 다른 모델(gemma, qwen 등)이 있다면 이름을 꼭 바꿔주세요!
generator = OllamaGenerator(model_name="exaone3.5")

# 2. 질문 입력
# 💡 표 안의 데이터를 물어보는 날카로운 질문으로 변경!
# test_chat.py 내부 질문 수정
# test_chat.py 내부 질문 수정
query = "상대평가 기준으로 A+에서 A0 등급을 받을 수 있는 학생의 비율은 몇 % 이하인가요?"
# 3. 검색 (Retriever)
search_results = retriever.retrieve(query, top_k=3)

# 4. 답변 생성 (Generator)
final_answer = generator.generate_answer(query, search_results)

# 5. 최종 결과 출력
print(f"\n{'='*20} [ 🤖 AI 조교의 최종 답변 ] {'='*20}")
print(final_answer)
print("=" * 63)