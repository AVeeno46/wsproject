# rag-docgen

RAG-based document generation and question answering project.

## Project Structure

- apps/client: client application
- apps/server: main backend server
- services/rag: parsing, chunking, embedding, vector search
- services/llm: LLM answer generation
- contracts/api: API request/response contracts
- docs: project documents

## Branch Rule

- main: stable final branch
- develop: integration test branch
- feature branches:
  - client/name/feature
  - server/name/feature
  - rag/name/feature
  - llm/name/feature

Do not push directly to main or develop.
Use Pull Request.
