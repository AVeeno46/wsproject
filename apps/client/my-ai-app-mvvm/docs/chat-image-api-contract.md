# 채팅 API — 연동 명세 (Client · Server · RAG)

> 채팅 중심(Gemini/ChatGPT 스타일) UI의 **단일 진입점**에 대한 3자 간 계약서. 서버팀이 RAG
> 작업으로 바빠서 클라이언트 쪽에서 스펙을 먼저 확정해 전달한다. 기존에 구현된 엔드포인트
> (`/dashboard/individual/*`, `/workspace/file/*`, `/token/*`)의 명명 규칙·인증 방식·
> 상태코드 패턴을 그대로 따른다.

> **채팅 입력창 하나가 조회·편집·문서뷰어 3가지를 다 커버한다.** 사용자는 "이 문서 내용
> 알려줘"(조회)와 "학점을 6으로 바꿔줘"(편집)를 구분 없이 같은 입력창에 자연어로 친다.
> 어떤 의도인지는 서버/RAG가 판단하고, 클라이언트는 응답 안에 섞여 오는 청크 타입만 보고
> 다르게 렌더링한다. 편집 관련 상세(`{id, newText}` 등)는
> [hwpx-edit-contract.md](./hwpx-edit-contract.md)를 참고 — 이 문서는 그 계약을 채팅
> 스트림 안으로 어떻게 실어 보내는지를 다룬다.

**적용 범위**
- 채팅 스트리밍(질문 → 조회 답변 / 편집 제안 / 문서 참조) + 취소
- AI 답변 속 표/이미지/편집 diff를 채팅 안에서 보여주기
- 범위 밖(이번엔 안 함): 질문 재생성, AI 생성 이미지 전용 갤러리(2단계로 미룸), 대화 내용 전문 검색

---

## 0. 핵심 원칙

1. **하나의 스트림 안에 여러 타입의 청크가 섞여서 온다.** 순수 텍스트(`text`)뿐 아니라
   편집 제안(`edit_proposal`), 참조 문서(`source_ref`)도 같은 SSE 스트림 안에 타입 필드로
   구분되어 온다 (§2.1). `text` 청크의 내용 자체는 여전히 마크다운(표 `| | |`, 굵게,
   코드블록, 이미지 `![]()`) — `react-markdown` + `remark-gfm`으로 그대로 렌더링.
2. **의도 판단(조회 vs 편집)은 서버/RAG 책임.** 클라이언트는 항상 같은 엔드포인트로 같은
   형태(`{dashboard_id, query}`)의 요청만 보낸다. "이건 편집 요청이다"를 판단해서 대상
   `file_id`를 찾고 편집안을 만드는 건 서버 쪽 로직 — 클라이언트는 응답 청크 타입만 보고
   분기 렌더링한다.
3. **편집 적용은 서버 재호출 없이 로컬에서 끝난다.** `edit_proposal` 청크가 오면 클라이언트가
   이미 갖고 있는 hwpx 편집 엔진(`hwpxModel.js`)으로 `{id, newText}`를 바로 적용한다. 자세한
   메커니즘은 [hwpx-edit-contract.md](./hwpx-edit-contract.md) 참고.
4. **질문 취소는 별도 API가 없다.** 클라이언트가 `AbortController`로 fetch 연결을 끊으면
   서버는 그 연결 종료를 감지해서(기존 코드 전반에 이미 있는 `CancellationToken` 패턴과
   동일) LLM 호출을 중단한다. 새 엔드포인트 불필요.
5. **이미지는 파일 단위로 서빙한다.** 별도 이미지 저장소를 새로 만들지 않고, 이미 업로드된
   hwpx 파일(`file_id`) 안에서 특정 이미지(`bin_id`, hwpx 내부 `content.hpf`의
   `opf:item id`)를 그때그때 꺼내서 스트리밍한다. 클라이언트가 hwpx를 파싱할 때 쓰는
   `hwpxModel.js`의 `buildImageUrls` 로직과 동일한 방식을 서버에서 재현하면 된다.

---

## 1. 아키텍처 / 데이터 흐름

```
[① 질문 전송 — 조회/편집 구분 없이 동일한 요청]
 Client → Server : POST /workspace/chat/stream { dashboard_id, query }
 Server : query 의도 판단
   ├─ 조회 의도 → RAG에 검색 요청 → 답변 생성(마크다운 텍스트, 이미지 마크다운 포함)
   │              → Client로 { type: "text" } 청크 스트리밍
   └─ 편집 의도 → 대상 file_id 추정 → RAG에 편집 요청(hwpx-edit-contract.md §3.2 내부 계약)
                  → edits [{id, newText}] 수신 → Client로 { type: "edit_proposal" } 청크 전송
 (조회/편집 어느 쪽이든) 참조한 문서가 있으면 { type: "source_ref" } 청크도 같이 보냄
 스트림 종료 시 data: [DONE]

[② 질문 취소]
 Client : AbortController.abort() → fetch 연결 종료
 Server : CancellationToken 이 취소됨 감지 → RAG 호출 중단 (기존 컨트롤러들의
          catch (OperationCanceledException) 패턴과 동일하게 처리)

[③ 이미지 인용 — 조회 응답 안의 image]
 RAG    : 답변 텍스트 안에 ![설명](/workspace/file/{file_id}/image/{bin_id}) 형태로 삽입
 Client : 마크다운 렌더러가 그 URL을 <img src="..."> 로 그대로 요청
 Server : file_id로 저장된 hwpx zip을 열어 content.hpf에서 bin_id에 해당하는
          바이너리를 찾아 스트리밍

[④ 편집 적용 — 서버 재호출 없음]
 Client : edit_proposal 청크를 채팅 안에 diff 카드로 렌더링, 사용자가 [적용] 클릭
 Client : hwpxModel.js 엔진으로 해당 file_id 문서를 열어 edits 를 로컬 적용
          (필요시 hwpx-edit-contract.md §3.3 저장 플로우로 서버에 업로드)
```

---

## 2. API 계약

> 경로는 기존 `WorkspaceFileController`(`Network/WorkSpace/WorkspaceFileController.cs`)와
> 같은 폴더에 `WorkspaceChatController.cs`를 만드는 걸 제안. 인증은 기존과 동일
> (JWT `Authorization: Bearer`, `[Authorize]`, `User.FindFirstValue(ClaimTypes.NameIdentifier)`로
> member_id 추출).
>
> 참고: `Network/SseManager.cs`가 이미 존재하므로, 스트리밍 응답 구현 시 새로 만들지 말고
> 이걸 재사용할 수 있는지 먼저 확인.

### 2.1 채팅 스트리밍

```
POST /workspace/chat/stream

Request
  header  JWT token
  body    { dashboard_id (long), query (string) }

Response (성공)
  Content-Type: text/event-stream
  각 청크: data: {JSON}\n\n
  종료 시: data: [DONE]\n\n

Status Code
  200                     스트림 시작 (헤더까지만 확정, 본문은 스트리밍)
  400 Bad Request         query 비어있음 / dashboard_id 형식 오류
  401 Unauthorized        JWT 없음/만료
  404 Not Found           member가 해당 dashboard에 미소속
  500 Internal Server Error
```

**청크 타입 3종** (`data:` 뒤에 오는 JSON의 `type` 필드로 구분):

```jsonc
// 1) 텍스트 — 조회 답변, 여러 번 나눠서 옴 (기존 문자 단위 스트리밍과 동일한 자리)
{ "type": "text", "content": "학점을 " }

// 2) 편집 제안 — 편집 의도로 판단됐을 때, 보통 스트림 끝 무렵 1번만
{
  "type": "edit_proposal",
  "file_id": 123,
  "edits": [
    { "id": "s0:15", "newText": "6", "reason": "신청학점 칸" }
  ]
}

// 3) 참조 문서 — 답변이 특정 파일을 근거로 했을 때, 0~N번
{ "type": "source_ref", "file_id": 123, "file_name": "이수신청서.hwpx" }
```

- 한 응답 안에 `text` 청크는 여러 개, `edit_proposal`/`source_ref`는 있으면 보통 스트림 뒷부분에
  1개씩(편집 대상이 여러 파일이면 여러 개도 허용).
- 순수 조회 의도면 `text` 청크(+ 선택적으로 `source_ref`)만 오고 `edit_proposal`은 없음.
- `text`의 `content`는 순수 마크다운. 표는 GFM 문법(`| 헤더 | 헤더 |` + 구분선), 이미지는
  `![alt](url)`.
- `edit_proposal`의 `edits` 배열 형식은 [hwpx-edit-contract.md](./hwpx-edit-contract.md)
  §3.2/부록 A와 동일 — 새로 정의하지 않고 그대로 재사용.
- **클라이언트 반영 완료**: [chatModel.js](../src/models/chatModel.js)의
  `streamChatRequest`가 `data:` 뒤 JSON을 `type`별로 파싱해 `onText`/`onEditProposal`/
  `onSourceRef` 콜백으로 분기하도록 구현됨(§5 참고). 서버가 위 3종 청크 형식으로만 보내주면
  클라이언트 쪽 추가 작업 없이 그대로 동작한다.

### 2.2 채팅 히스토리 조회

```
GET /workspace/chat/history/{dashboard_id}

Request
  header  JWT token

Response
  body  [{
    role (string: "user" | "ai"),
    text (string),
    created_at (string, ISO 8601)
  }]

Status Code
  200 OK
  400 Bad Request
  401 Unauthorized
  404 Not Found         member가 해당 dashboard에 미소속
  500 Internal Server Error
```

- 클라이언트 [chatModel.js](../src/models/chatModel.js)의 `fetchChatHistoryRequest`가
  이미 이 배열 형태를 기대하고 있음(`role`/`text`/`createdAt` 순으로 매핑).

### 2.3 문서 이미지 서빙

```
GET /workspace/file/{file_id}/image/{bin_id}

Request
  header  JWT token

Response
  header  Content-Type: image/*  (hwpx 안 실제 이미지 포맷 그대로)
  body    이미지 바이너리(stream)

Status Code
  200 OK
  400 Bad Request        bin_id 형식 오류
  401 Unauthorized
  404 Not Found          file_id 없음 / 해당 file 안에 그 bin_id 이미지 없음 / member 권한 없음
  500 Internal Server Error
```

- `bin_id`는 hwpx zip 안 `Contents/content.hpf`의 `<opf:item id="...">` 값. 서버는
  `file_id`로 저장된 hwpx를 열어 이 id에 매칭되는 `href`의 실제 바이너리를 스트리밍하면 됨
  (클라 [hwpxModel.js](../src/models/hwpxModel.js)의 `buildImageUrls` 로직 참고 —
  같은 걸 서버에서 하면 됨).
- RAG가 답변 마크다운에 이 URL을 넣을 때는 `file_id`/`bin_id`를 알고 있어야 하므로,
  ①단계(질문 전송) 때 서버가 RAG에게 해당 dashboard의 파일 목록과 각 파일의 이미지
  bin_id 목록을 같이 넘겨줘야 함 (RAG 프롬프트 컨텍스트 구성 문제 — 서버·RAG 간 협의 필요,
  이 문서의 범위는 "클라가 최종적으로 어떤 URL을 받으면 되는가"까지).

---

## 3. 역할 분담

| 책임 | Client | Server | RAG |
|---|:---:|:---:|:---:|
| 마크다운 렌더링(표/코드/이미지) | ✅ | | |
| SSE 스트림 수신(타입별 분기) + 취소(AbortController) | ✅ | | |
| SSE 스트림 송신 + 취소 감지(CancellationToken) | | ✅ | |
| 의도 판단(조회 vs 편집) | | ✅ | ✅ (협의 필요) |
| 편집 제안 [적용] 시 로컬 hwpx 반영 | ✅ | | |
| hwpx에서 이미지 바이너리 추출·서빙 | | ✅ | |
| 답변을 마크다운(표/이미지 문법 포함)으로 생성 | | | ✅ |
| 편집 지시 생성(`{id, newText}`) | | | ✅ |
| RAG에게 파일/이미지/segment 컨텍스트 제공 | | ✅ | |

---

## 4. 미정 / 확인 필요

- [ ] `/workspace/chat/*` 경로 최종 확정 (기존 `workspace/file` 패밀리에 맞춘 제안)
- [ ] **의도 판단(조회 vs 편집) 주체** — 서버가 규칙 기반으로 판단할지, RAG(LLM)에게
      판단까지 맡길지. hwpx-edit-contract.md §6에도 동일 항목 추가해둠
- [ ] 편집 대상 `file_id`를 사용자가 명시 안 했을 때 어떤 파일을 고를지 규칙
- [ ] RAG가 이미지 URL을 정확히 어떤 형태로 답변에 삽입할지 — 서버가 프롬프트에
      `file_id`/`bin_id` 목록을 미리 넣어줘야 함 (서버·RAG 협의 필요)
- [ ] 채팅 히스토리 조회 시 과거의 `edit_proposal`/`source_ref`도 같이 복원해야 하는지
      (§2.2는 현재 `role`/`text`만 정의 — 편집 제안 이력까지 필요하면 스키마 확장 필요)
- [ ] 채팅 히스토리 페이지네이션 필요 여부 (대화가 길어지면 전체 반환은 비효율적일 수 있음)
- [ ] AI 생성 이미지 전용 갤러리(사이드바 기능) — 이번 범위 밖, 이미지 서빙 방식이 자리잡은
      뒤 "이 대화에서 인용된 이미지 목록" API로 별도 설계
- [ ] 대화 내용 전문 검색 — 범위(제목만 vs 본문 포함) 미정, 이번 계약에서 제외

---

## 5. 클라이언트 상태

**이미 준비된 것 (서버 스펙 없이도 목 데이터로 검증 완료)**
- [chatModel.js](../src/models/chatModel.js)의 `streamChatRequest` — `data:` 뒤 JSON을
  `parseChunk`로 파싱해 `type`별(`text`/`edit_proposal`/`source_ref`)로 콜백 분기 완료.
  JSON이 아니면(구버전 서버 호환) `text` 청크로 폴백.
- [chatViewModel.js](../src/viewmodels/chatViewModel.js) — 메시지 객체에 `editProposal`,
  `sourceRefs`(배열) 필드 반영 완료. `cancelMessage()`로 `AbortController.abort()` 호출,
  진행 중 응답은 부분 텍스트로 유지.
- [ChatMessage.jsx](../src/features/note/right/ChatMessage.jsx) — `react-markdown` +
  `remark-gfm`으로 `text` 렌더링, `sourceRefs`는 클릭 가능한 문서 카드(📄)로, `editProposal`은
  `edits` 목록 + `reason` + [적용] 버튼이 있는 diff 카드로 렌더링. 복사 버튼도 포함.
  ([AiDiffViewer.jsx](../src/features/note/center/AiDiffViewer.jsx)는 미사용 스텁으로
  남아있음 — 실제 diff UI는 이 파일 안에 인라인으로 구현됨)
- 질문 취소 — `ChatPanel.jsx`에서 답변 생성 중 전송 버튼이 정지(■) 버튼으로 바뀌어
  `cancelMessage`를 호출하도록 연결 완료.
- 문서 캔버스 열기 — [DocPanelContext.jsx](../src/features/chat/context/DocPanelContext.jsx)
  `open(source)`로 `source_ref` 클릭 시 캔버스 여는 구조 준비됨.

**아직 안 한 것 (서버 스펙과 무관하게 클라이언트에서 마저 해야 할 실제 작업)**
- **`editProposal`의 [적용] 버튼이 아직 어디에도 연결 안 됨.** `ChatMessage.jsx`는
  `onApplyEdits` prop을 받게만 되어 있고, `ChatPanel.jsx`도 그 prop을 그대로 통과시키지만,
  현재 [ChatView.jsx](../src/features/chat/ChatView.jsx)가 `ChatPanel`에 `onApplyEdits`를
  넘기지 않아서 **[적용] 버튼을 눌러도 아무 동작도 안 함**. 실제로 `hwpxModel.js`의 편집
  엔진(§0-3, `applyEdits`)을 호출해 열려 있는 hwpx 문서에 반영하는 핸들러를 `ChatView.jsx`
  에 구현해서 내려줘야 §0-3 흐름(로컬 적용)이 완성됨.
- 위 항목 때문에, 편집 제안이 와도 지금은 "읽기 전용 diff 카드"로만 보임 — 서버 스펙이
  나와서 실제 `edit_proposal` 청크가 오기 전이라도 이 배선은 로컬 mock으로 먼저 검증 가능.
