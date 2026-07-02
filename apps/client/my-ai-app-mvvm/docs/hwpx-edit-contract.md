# 한글(.hwpx) 문서 편집 — 연동 명세 (Client · Server · RAG)

> 중앙 작업공간에서 `.hwpx` 문서를 **수동 편집 + AI 편집**으로 수정하기 위한 3자 간 계약서.
> 세 쪽(클라이언트 / 서버 / RAG)이 이 문서만 보고 **병렬로** 작업할 수 있도록 형식을 고정한다.

> **[업데이트] AI 편집의 진입점이 바뀜.** 채팅 중심 UI로 전환하면서, 클라이언트는 더 이상
> 아래 3.2(`/document/ai-edit`)를 직접 호출하지 않는다. 사용자는 채팅 입력창에 자연어로
> 조회/편집을 섞어서 입력하고, **서버가 의도(조회 vs 편집)를 판단**해서 편집이면 이 문서의
> `{id, newText}` 형식을 그대로 재사용해 채팅 응답 안에 `edit_proposal` 청크로 실어 보낸다.
> 즉 **3.2는 이제 Server↔RAG 내부 계약**이 되고, Client-facing 진입점은
> [chat-image-api-contract.md](./chat-image-api-contract.md)의 `POST /workspace/chat/stream`
> 하나로 통합된다. 1단계(인제스트)·3단계(저장+재임베딩)는 기존 그대로 유효.

**적용 범위 (1단계 = 텍스트 칸 채우기/고치기)**
- 사용자가 올린 문서 편집 **+ 빈 양식(템플릿) 채우기 = "AI 문서 생성"** 모두 *이 한 가지 동작*으로 처리된다. (시작 파일이 사용자 파일이냐 템플릿이냐 차이뿐, 형식은 동일)
- 새 문단·표를 **추가 생성**하는 작업(스켈레톤 클론, 2단계)은 이 명세 밖. 추후 `insert` 동작으로 확장한다.

---

## 0. 핵심 원칙 (이것만 합의하면 됨)

1. **RAG는 hwpx를 직접 파싱하지 않는다.** 클라이언트가 hwpx를 쪼개서 `[{id, text}]` 목록으로 넘긴다. RAG는 hwpx가 뭔지 몰라도 됨 — 받은 텍스트를 임베딩하고 `id`로 답하기만 하면 된다.
2. **AI는 문서를 통째로 새로 쓰지 않는다.** `{id, newText}` 형태의 **교체 지시만** 반환한다. 실제 XML 교체는 클라이언트의 검증된 엔진이 수행 → 서식(표/이미지/스타일)이 100% 보존된다.
3. **id는 파일에서 결정론적으로 계산**되며, 텍스트만 바꾸는 편집에서는 **저장 후에도 변하지 않는다.**

---

## 1. 아키텍처 / 데이터 흐름

연결: **Client ↔ Server ↔ RAG** (클라는 RAG를 직접 호출하지 않음)

```
[① 인제스트 — 업로드 직후]
 Client : hwpx 파싱 → segments [{id, text, block}]
 Client → Server :  hwpx 바이트 + segments
 Server : 파일 저장 + segments 를 RAG로 전달
 RAG    : block(문단) 단위로 묶어 임베딩 (id 보존)        ← hwpx 안 만짐

[② AI 편집 — 채팅을 통해 트리거됨, 상세는 chat-image-api-contract.md]
 Client → Server :  POST /workspace/chat/stream { dashboard_id, query }  (자연어, file_id 지정 안 함)
 Server          :  query 의도 판단(조회 vs 편집) — 편집이면 대상 file_id 도 RAG 검색으로 추정
 Server → RAG    :  { file_id, instruction }                             (내부 호출, 3.2 참고)
 RAG    : 관련 segment 검색 → Claude(tool-use) → edits [{id, newText}]
 RAG → Server → Client :  SSE 청크 { type: "edit_proposal", file_id, edits }
 Client : 채팅 말풍선 안에 diff 카드로 표시 → [적용] 누르면 로컬 엔진(hwpxModel.js)으로
          해당 파일을 열어 edits 의 id 로 <hp:t> 교체 (서버 재호출 없음)

[③ 저장]
 Client : 수정본 hwpx 생성(엔진) → Server 업로드
 Server → RAG : 바뀐 segment {id, newText} 재임베딩          (안 하면 검색이 옛 텍스트 참조)
```

---

## 2. Segment ID 규칙 (가장 중요)

`.hwpx` 는 zip + XML(OWPML). 본문은 `Contents/sectionN.xml` (N = 0,1,2…).

```
조각 단위 = <hp:t>            (한글 문서의 텍스트 런)
조각 id   = "s{섹션번호}:{그 섹션 안 <hp:t> 등장 순서(0-base)}"
조각 text = 그 <hp:t> 안의 글자 (XML 엔티티 디코드 후)
block     = 그 <hp:t> 가 속한 문단(<hp:p>)의 0-base 순서   (RAG 묶음용, 선택)
```

규칙 상세:
- `Contents/sectionN.xml` 을 **N 오름차순**으로 처리.
- 각 섹션 안에서 `<hp:t>` 를 **문서 등장 순서대로** 0,1,2… 카운트 (빈 `<hp:t>` 포함).
- 예) `s0:47` = `section0.xml` 의 48번째 `<hp:t>`.

> **누가 계산하나:** 클라이언트가 인제스트(①) 때 1회 계산해서 RAG로 넘긴다.
> 두 파서가 따로 돌지 않으므로 **id 불일치 자체가 발생하지 않는다.**
> 클라가 나중에 같은 파일을 다시 열어도 같은 규칙이라 같은 id가 나온다(텍스트 교체는 `<hp:t>` 개수·순서를 바꾸지 않음).

---

## 3. API 계약

> 경로(URL)는 **서버팀 명명 규칙에 맞춰 조정 가능** — 아래는 제안. 필드명/형식이 본질.
> 인증은 기존과 동일(JWT `Authorization: Bearer`, refresh 쿠키). camelCase/REST 컨벤션 유지.

### 3.1 인제스트 — segments 등록 (① 단계)

업로드가 `file_id` 를 돌려준 직후, 클라이언트가 추출한 segments 를 등록.

```
POST  /document/ingest          (제안)
요청  {
  "fileId": 123,
  "segments": [
    { "id": "s0:0",  "text": "<별지2 서식>",          "block": 0 },
    { "id": "s0:13", "text": "우송비트고급과정(43기)", "block": 9 },
    { "id": "s0:15", "text": "3",                      "block": 10 },
    ...
  ]
}
응답  { "ok": true, "chunkCount": 42 }
```

- 서버: `fileId` 와 매핑해 저장 후 RAG로 전달.
- RAG: `block` 기준으로 인접 segment 를 묶어 임베딩하되, **각 청크가 포함한 `id` 목록을 보존**한다.
  (개별 `<hp:t>` 는 "3", "전공" 처럼 너무 짧아 단독 임베딩은 의미가 약함 → 문단 단위 묶기 권장)

### 3.2 AI 편집 (② 단계) — **Server↔RAG 내부 계약** (Client는 직접 호출하지 않음)

> Client가 실제로 호출하는 엔드포인트는 `POST /workspace/chat/stream`
> ([chat-image-api-contract.md](./chat-image-api-contract.md) 참고) 하나뿐이다. 아래는 그
> 요청을 처리하는 도중 서버가 RAG를 호출할 때 쓰는 내부 계약 — 필드 이름/형식(특히
> `{id, newText}`)은 그대로 유지하고, 요청·응답 경로만 채팅 스트림 안으로 흡수된다.

```
(Server → RAG, 내부 호출)  {
  "fileId": 123,
  "instruction": "신청학점을 6으로 올리고, 기수를 44기로 바꿔줘"
}
(RAG → Server, 내부 응답)  {
  "edits": [
    { "id": "s0:15", "newText": "6",                      "reason": "신청학점 칸" },
    { "id": "s0:13", "newText": "우송비트고급과정(44기)", "reason": "특별과정명 기수" }
  ]
}
```

서버는 이 `edits`를 받으면 채팅 SSE 스트림에 다음 형태로 실어 클라이언트에 전달한다:
```
data: {"type":"edit_proposal","file_id":123,"edits":[{"id":"s0:15","newText":"6","reason":"신청학점 칸"}]}
```

- RAG: `instruction` 으로 관련 segment 검색 → **Claude tool-use** 로 `{id, newText}` 생성 (부록 A 스키마).
- **응답에는 절대 hwpx/XML/문서 전문이 들어가지 않는다.** 오직 `edits` 배열.
- 바꿀 게 없으면(순수 조회 의도였던 경우) `edit_proposal` 청크 자체를 안 보내고 `text` 청크만 스트리밍.
- **의도 판단(조회 vs 편집)은 서버 또는 RAG 쪽 책임** — 이 문서에서 별도로 규정하지 않음
  (chat-image-api-contract.md 미정 항목 참고).

### 3.3 저장 + 재임베딩 (③ 단계)

```
POST  /document/save            (제안, 바이너리 업로드)
요청  multipart 또는 octet-stream:  fileId + 수정된 hwpx 바이트
응답  { "ok": true }

# 저장으로 바뀐 칸을 RAG 검색에도 반영 (서버가 RAG로)
POST  /document/reindex         (제안)
요청  { "fileId": 123, "changed": [ { "id": "s0:15", "text": "6" } ] }
응답  { "ok": true }
```

---

## 4. 역할 분담

| 책임 | Client | Server | RAG |
|---|:---:|:---:|:---:|
| hwpx ↔ segments 파싱 / 교체 / 저장(엔진) | ✅ | | |
| 파일 저장·서빙, 요청 중계 | | ✅ | |
| segment 임베딩 / 검색 | | | ✅ |
| Claude 호출 (tool-use, 구조화 출력) | | | ✅ |
| 수정 미리보기(diff) + 적용 UI | ✅ | | |

**XML 만지는 건 100% 클라, AI 두뇌는 100% RAG, 서버는 저장·중계.** 경계가 겹치지 않음.

---

## 5. 구체 예시 (샘플: 우송비트 이수신청서)

| id | 원본 text | 의미 |
|---|---|---|
| `s0:13` | `우송비트고급과정(43기)` | 특별과정명 |
| `s0:15` | `3` | 신청학점 |
| `s0:52` | `   최 창 민   (인)` | 과정책임교수 |

AI 편집 요청: `"학점 6으로, 책임교수 홍길동으로"` →

```json
{ "edits": [
  { "id": "s0:15", "newText": "6" },
  { "id": "s0:52", "newText": "   홍 길 동   (인)" }
] }
```

→ 클라가 `s0:15`, `s0:52` 의 `<hp:t>` 만 교체. 표/서식 그대로. (라운드트립 검증 완료)

---

## 6. 미정 / 확인 필요

- [ ] 인제스트(`/document/ingest`) 엔드포인트 경로 최종 확정 (서버 기존 `/workspace/...` 패밀리에 맞출지)
- [ ] 인제스트를 업로드와 **합칠지**(한 번에) / **분리**할지(file_id 받은 뒤)
- [ ] RAG 청크 단위: 문단(`block`) 기준이면 충분한지, 표/셀은 따로 다룰지
- [ ] AI가 "새 행/새 문단 추가"를 요청받으면? → **이번 범위 밖(텍스트 교체만)**, 거절 또는 무시로 합의
- [ ] 저장 방식: 클라가 완성본 업로드(현 설계) vs 서버가 edits 받아 적용(서버에 XML 로직 필요)
- [ ] 재임베딩 트리거: 저장 시마다 vs 일정 주기
- [ ] **[신규]** 채팅 의도 판단(조회 vs 편집)을 서버가 할지 RAG가 할지 — 결정 주체 확정 필요
- [ ] **[신규]** 편집 대상 `file_id`를 사용자가 명시 안 했을 때(예: dashboard에 파일이 여러 개),
      RAG가 어떤 파일을 고를지(가장 최근 언급된 파일? 질문과 가장 관련 있는 파일 검색?) 규칙 필요
- [ ] **[신규]** `edit_proposal`을 채팅에서 [적용] 안 하고 넘어가면(무시) 그 상태를 서버가
      알 필요가 있는지, 아니면 클라이언트 로컬 상태로만 남는지

---

## 부록 A. Claude tool-use 스키마 (RAG 담당자용)

AI가 자유 텍스트가 아니라 **구조화된 교체 목록**을 내도록 tool 로 강제한다. 최신 Claude(Opus 4.8) 권장.

```json
{
  "name": "apply_document_edits",
  "description": "문서의 특정 텍스트 칸을 새 값으로 교체한다. 칸은 사전에 주어진 segment id 로만 지정한다.",
  "input_schema": {
    "type": "object",
    "properties": {
      "edits": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id":      { "type": "string", "description": "교체할 칸의 segment id (예: s0:15)" },
            "newText": { "type": "string", "description": "그 칸에 들어갈 새 텍스트" },
            "reason":  { "type": "string", "description": "이 칸을 바꾼 이유(선택)" }
          },
          "required": ["id", "newText"]
        }
      }
    },
    "required": ["edits"]
  }
}
```

- 프롬프트에는 검색으로 추린 후보 칸만 `{id, text}` 형태로 제공(전체 X).
- 모델이 주어진 `id` 외의 값을 만들지 않도록 system 지시에 명시.
