# 채팅 API — 연동 명세 (Client · Server · RAG)

> 채팅 중심(Gemini/ChatGPT 스타일) UI의 **단일 진입점**에 대한 3자 간 계약서. 서버팀이 RAG
> 작업으로 바빠서 클라이언트 쪽에서 스펙을 먼저 확정해 전달한다. 기존에 구현된 엔드포인트
> (`/workspace/file/*`, `/token/*`)의 명명 규칙·인증 방식·상태코드 패턴을 그대로 따른다.
>
> **업데이트**: 대화 식별자가 `dashboard_id` → `chatroom_id`로 바뀐다(서버팀 제안,
> `dashboard`는 서버 내부 전용으로 전환되고 대화 목록 관리는 새 `chatroom` 리소스로
> 분리됨). 아래 §2.1/§2.2의 `dashboard_id`는 전부 `chatroom_id`로 읽는다. 자세한 내용은
> [chatroom-api-contract.md](./chatroom-api-contract.md) 참고(가정 계약, 서버팀 확정 전).

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
   형태(`{chatroom_id, query}`)의 요청만 보낸다. "이건 편집 요청이다"를 판단해서 대상
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
 Client → Server : POST /workspace/chat/dialogize { chatroom_id, query }
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

> 엔드포인트 이름 변경 이력: 서버팀 제안으로 `chat/stream` → `chat/dialogize`로
> 변경(요청/응답 형식은 동일, 경로 이름만 변경). 이후 식별자도 `dashboard_id` →
> `chatroom_id`로 변경(서버팀 제안, 가정 계약 — [chatroom-api-contract.md](./chatroom-api-contract.md) §5).

```
POST /workspace/chat/dialogize

Request
  header  JWT token
  body    { chatroom_id (long), query (string) }

Response (성공)
  Content-Type: text/event-stream
  각 청크: data: {JSON}\n\n
  종료 시: data: [DONE]\n\n

Status Code
  200                     스트림 시작 (헤더까지만 확정, 본문은 스트리밍)
  400 Bad Request         query 비어있음 / chatroom_id 형식 오류
  401 Unauthorized        JWT 없음/만료
  404 Not Found           member가 해당 chatroom에 미소속
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

### 2.2 채팅 히스토리 조회 (+ 페이지네이션, 가정 계약)

> **[업데이트] 무한 스크롤(위로 스크롤 → 이전 대화 추가 로드)을 위해 페이지네이션
> 파라미터를 새로 가정해서 클라이언트에 먼저 구현해뒀다.** 처음엔 최근 N개만
> 불러오고, 사용자가 메시지 목록 맨 위로 스크롤하면 그 이전 메시지를 추가로
> 불러와 앞에 붙이는 방식(카카오톡/디스코드 등과 동일한 패턴). 실제 서버가 이
> 파라미터를 지원하는지는 미확인 — 아래는 "이렇게 받아줄 것이다"라는 가정.

> **[업데이트] 필드 타입/네이밍 — 서버팀 피드백 반영**: `before`/메시지 id를
> string이 아니라 **long**으로, 메시지 id 필드명은 그냥 `id`가 아니라
> **`chat_id`**로 통일한다(채팅방 id가 `chatroom_id`인 것과 짝을 맞춰서, 어디는
> `id`/어디는 `chatroom_id`/어디는 `chat_id`처럼 뒤섞이지 않도록 — 이 원칙은
> 앞으로 추가되는 다른 리소스의 식별자에도 동일하게 적용). `limit`도 선택
> 파라미터로 명시(생략 시 서버 기본값, 클라이언트도 기본 30을 보냄).

```
GET /workspace/chat/history/{chatroom_id}?limit={n}&before={chat_id}

Request
  header  JWT token
  query   limit  (number, 선택 — 한 번에 가져올 개수, 기본 30·클라이언트 PAGE_SIZE와 동일)
          before (long, 선택 — 이 chat_id보다 이전(더 오래된) 메시지만 조회.
                  최초 로드 시에는 생략하고, "이전 대화 더 보기"에서만 실어 보냄)

Response
  body  [{
    chat_id (long, 이 메시지의 고유 id — before 파라미터로 재사용됨)
    role (string: "user" | "ai"),
    type (string: "text" | "file", 선택 — 생략 시 "text"로 간주)
    text (string, 파일만 있고 텍스트가 없으면 빈 문자열)
    attachments (array, 선택 — [{ file_id (long), file_name (string) }], 없으면 생략)
    created_at (string, ISO 8601)
  }]   (과거 → 최신 순으로 최대 limit개)

Status Code
  200 OK
  400 Bad Request
  401 Unauthorized
  404 Not Found         member가 해당 chatroom에 미소속
  500 Internal Server Error
```

- 응답 배열 길이가 `limit`과 같으면 "더 있을 수도 있다"고 간주해서 클라이언트가
  다음 페이지를 요청할 수 있게 한다(서버가 별도로 `has_more` 같은 플래그를 줄
  수 있다면 그게 더 정확함 — 미정, §4 참고).
- 각 메시지에 **고유 `chat_id`가 응답에 포함**되어야 한다 — 클라이언트가 그 값을
  다음 `before` 파라미터로 그대로 되돌려 보내는 커서 방식이라, 없으면 페이지네이션
  자체가 안 됨.
- **[확정] 파일 포함 메시지 형식**: 메시지에 `type: "file"` + `attachments:
  [{file_id, file_name}]`를 추가하는 방식으로 서버팀과 합의. `type`은 렌더링
  분기용 표시(파일이 있으면 "file", 없으면 "text"/생략)이고, `attachments`가
  실제 데이터다 — 텍스트와 파일이 한 메시지에 같이 있어도(`text` + `attachments`
  둘 다 채워짐) 표현 가능. `file_id`만 있으면 클라이언트가 이미 있는
  `/workspace/file/get/{file_id}` 다운로드 경로([file-upload-api-contract.md](./file-upload-api-contract.md)
  §2.4)를 그대로 재사용해서 열람할 수 있다.
  - **[확정] `attachments` 생략 방식**: 첨부 없으면 키 자체를 응답에서 뺀다(빈
    배열 `[]`이나 `null`을 굳이 보낼 필요 없음). 클라이언트는 없음/`null`/빈
    배열을 전부 "첨부 없음"으로 동일하게 처리하도록 만든다.
  - **[확정] 텍스트+파일이 한 메시지에 같이 있을 때 `type`**: `attachments`가
    하나라도 있으면 무조건 `"file"`(텍스트가 같이 있어도), `attachments`가
    아예 없을 때만 `"text"`. 즉 file이 text보다 우선순위가 높다 — 실제 데이터는
    `attachments` 유무로 판단하고 `type`은 보조 힌트일 뿐이라, 파일 존재를
    놓치지 않는 쪽(file 우선)으로 정함.
  - **아직 반영 안 함**: 채팅 입력창의 파일 첨부 버튼은 현재 UI만 있고 실제
    업로드 로직에 연결되어 있지 않다(`DashboardChatPage.jsx`). 이 히스토리
    응답의 `type`/`attachments` 파싱·렌더링은 그 업로드 경로가 정해지면 같이
    구현한다.
- 클라이언트 [chatModel.js](../src/models/chatModel.js)의 `fetchChatHistoryRequest`가
  이미 이 배열 형태(+ 페이지네이션 파라미터)를 기대하고 있음(`chat_id`/`role`/`text`/`createdAt`
  순으로 매핑, [chatViewModel.js](../src/viewmodels/chatViewModel.js)의
  `normalizeHistory`에서 `chat_id`를 우선 읽고 없으면 구버전 호환으로 `id`도
  받아준다).

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
- [x] ~~채팅 히스토리 페이지네이션 필요 여부~~ → **결정**: 필요함. 서버 스펙이
      아직 없어서 클라이언트가 먼저 가정 계약(§2.2의 `limit`/`before`/응답 `chat_id`)으로
      구현해뒀다 — 서버는 이 파라미터를 지원하도록 만들어달라고 요청하는 흐름.
      실제 파라미터명/커서 방식(메시지 id vs 타임스탬프)/`has_more` 플래그 제공
      여부는 서버팀 확인 필요.
- [x] ~~히스토리 응답의 파일 첨부 형식~~ → **확정**: 메시지에 `type: "file"` +
      `attachments: [{file_id, file_name}]`을 추가하는 방식으로 합의(§2.2 참고).
      단, 채팅 입력창의 파일 첨부 업로드 경로 자체가 아직 없어서 클라이언트
      파싱/렌더링 구현은 그 경로가 정해진 뒤로 미룸.
- [ ] AI 생성 이미지 전용 갤러리(사이드바 기능) — 이번 범위 밖, 이미지 서빙 방식이 자리잡은
      뒤 "이 대화에서 인용된 이미지 목록" API로 별도 설계
- [ ] 대화 내용 전문 검색 — 범위(제목만 vs 본문 포함) 미정, 이번 계약에서 제외

---

## 5. 클라이언트 상태

> **[업데이트]** 이 섹션은 원래 note(좌/중앙/우) 3분할 레이아웃 시절
> (`ChatMessage.jsx`/`ChatPanel.jsx`/`ChatView.jsx`/`DocPanelContext.jsx`) 기준으로
> 쓰여 있었는데, 그 파일들은 전부 대시보드 UI로 마이그레이션하면서 삭제됐다. 아래는
> 지금 실제 구현([DashboardChatPage.jsx](../src/features/dashboard/DashboardChatPage.jsx)
> 기준)에 맞춰 다시 정리한 내용.

**이미 준비된 것**
- [chatModel.js](../src/models/chatModel.js)의 `streamChatRequest` — `data:` 뒤 JSON을
  `parseChunk`로 파싱해 `type`별(`text`/`edit_proposal`/`source_ref`)로 콜백 분기 완료.
  JSON이 아니면(구버전 서버 호환) `text` 청크로 폴백.
- [chatViewModel.js](../src/viewmodels/chatViewModel.js) — 메시지 객체에 `editProposal`,
  `sourceRefs`(배열) 필드는 여전히 반영됨. `cancelMessage()`로 `AbortController.abort()`
  호출하는 함수 자체는 존재.
- [DashboardChatPage.jsx](../src/features/dashboard/DashboardChatPage.jsx) — `text`는
  `react-markdown` + `remark-gfm`으로 렌더링(표/코드블록/이미지 포함, 이미지 로드 실패 시
  안내문구로 대체하는 `MarkdownImage` 포함). 히스토리 페이지네이션(무한 스크롤)도 반영됨.
- **[반영 완료] 질문 취소(정지 버튼) UI.** 답변 생성 중(`isThinking`)엔 전송 버튼이
  정지(■) 아이콘으로 바뀌어 `cancelMessage()`를 호출한다(`DashboardChatPage.jsx`/
  `DashboardView.jsx`). 클릭 시 `AbortController.abort()`로 스트림이 즉시 끊기고,
  그때까지 받은 부분 응답은 그대로 화면에 남는다 — 브라우저에서 스트리밍 도중
  클릭 → 응답이 중간에서 멈추고 버튼이 다시 전송 아이콘으로 돌아오는 것까지 확인.
- **[반영 완료] `sourceRefs`(참조 문서) 클릭 → 문서 열람.** AI 답변 아래에 출처
  파일명 칩(`chatSourceRefChip`)으로 렌더링되고, 클릭하면 "등록된 자료"와 같은
  고정 오버레이로 문서 뷰어(`DocWorkspace`/`DocViewer`)가 뜬다. 다만 이 경로는
  `file_id`가 아니라 **`file_name`으로 서버에 조회**한다(새 엔드포인트
  `GET /workspace/file/get-by-name`, [file-upload-api-contract.md](./file-upload-api-contract.md)
  §2.5 참고, 가정 계약) — "등록된 자료" 목록에서 여는 기존 경로(`file_id` 기반, §2.4)와는
  별개다.

**아직 안 한 것 (새 대시보드 UI로 옮기면서 이관 안 된 기능들 — 재구현 필요)**
- **`editProposal`(AI 편집 제안) 렌더링이 화면에 없음.** `chatViewModel.js`는 여전히
  메시지에 `editProposal` 필드를 채워 넣지만, `DashboardChatPage.jsx`는 이 필드를 전혀
  읽지 않는다 — 즉 서버가 실제로 편집 제안 청크를 보내도 화면에 diff 카드나 [적용]
  버튼이 뜨지 않는다. hwpx 편집 엔진(`hwpxModel.js`의 `applyEdits`) 연결도 없음.
- 이건 "서버 스펙이 없어서" 못 한 게 아니라, **UI 마이그레이션 과정에서 범위 밖으로
  미뤄둔 채 아직 다시 안 만든 것**이다 — 필요해지면 새 디자인에 맞춰 다시 구현해야 한다.
