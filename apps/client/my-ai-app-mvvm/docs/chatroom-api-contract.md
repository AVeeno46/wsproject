# 채팅방(chatroom) API — 가정 계약 (Client · Server)

> 서버팀 제안: 기존 `dashboard`(`/dashboard/individual/*`)는 원래 파일 업로드·저장
> 중심 개념이었는데, 이제 **채팅(대화) 목록 관리는 `chatroom`이라는 별도 리소스로
> 분리**하고, `dashboard`는 서버 내부(파일/임베딩 관리)로만 남는다. 클라이언트는
> `/dashboard/individual/*`를 더 이상 호출하지 않는다.
>
> 실제 스펙(정확한 경로/HTTP 메서드/필드명)은 아직 서버팀과 확정되지 않은 상태다.
> 여기 적힌 건 기존 `dashboard/individual` API의 구조를 그대로 본떠 "서버가 이렇게
> 받아줄 것이다"라고 가정한 것 — 실제 스펙이 나오면 이 문서와
> [chatRoomModel.js](../src/models/chatRoomModel.js),
> [chatModel.js](../src/models/chatModel.js) 세 파일만 고치면 되는 구조.

**적용 범위**
- 채팅방(대화) 목록 조회 / 생성 / 삭제 / 이름수정
- 채팅방 생성 시 **첫 메시지를 같이 보내서 서버가 이름을 자동 생성**하는 흐름
- 기존 `/workspace/chat/dialogize`, `/workspace/chat/history/{id}`의 식별자가
  `dashboard_id` → `chatroom_id`로 바뀌는 것

**범위 밖**
- 파일 업로드/조회가 `dashboard_id` 대신 무엇을 기준으로 동작할지("embedding 여부")
  — 아직 서버팀과 정리 전, 별도 문서에서 다룰 예정. 그때까지
  [sourceModel.js](../src/models/sourceModel.js)는 지금처럼 `dashboard_id` 필드명 +
  현재 대화(conversationId) 값을 그대로 사용한다.

---

## 1. 채팅방 목록 조회

```
GET /chatroom/get-all

Request
  header  Authorization: Bearer <JWT>

Response (성공)
  body  [{ chatroom_id (long), chatroom_name (string) }]

Status Code
  200 OK
  401 Unauthorized   JWT 없음/만료
```

## 2. 채팅방 생성 (+ 첫 메시지 기반 이름 자동 생성)

> **[확정] SSE 방식으로 결정** — `chatroom_id`는 DB insert라 빠르게 나오지만
> `chatroom_name`은 RAG 호출이 필요해 느리다. 그래서 create를 SSE로 열어
> `chatroom_id`를 먼저 이벤트로 보내고(클라이언트는 이 id를 받는 즉시
> `dialogize`(§5)를 병렬로 호출해 답변 스트리밍을 시작), `chatroom_name`은
> 같은 스트림에서 나중에 오는 이벤트로 받아 사이드바 제목만 갱신한다. (서버팀
> 확정 — 기존 §8 "논의 중" 항목이 이 방향으로 결론남.)

```
POST /chatroom/create

Request
  header  Authorization: Bearer <JWT>
  body    application/json
            first_message (string, 사용자가 처음 입력한 채팅 내용)

Response (성공)
  Content-Type: text/event-stream
  각 청크: data: {JSON}\n\n
  종료 시: data: [DONE]\n\n

  이벤트 1 (빠름, DB insert 직후)  data: { "chatroom_id": 123 }
  이벤트 2 (느림, RAG 이름 생성 후) data: { "chatroom_id": 123, "chatroom_name": "..." }

Status Code
  200                    스트림 시작(헤더까지만 확정, 본문은 스트리밍)
  400 Bad Request       first_message 비어있음
  401 Unauthorized       JWT 없음/만료
  500 Internal Server Error
```

- 클라이언트는 방 제목을 직접 짓지 않는다(기존 "새 대화", "새 대화 2" 식 클라이언트
  자동 넘버링 로직은 제거). `first_message`만 보내면 서버가 그 내용을 바탕으로
  `chatroom_name`을 만들어서 이벤트로 돌려준다.
- 클라이언트는 `chatroom_id` 이벤트를 받는 즉시(이름을 기다리지 않고) 그 id로
  `/chat/{id}` 화면으로 이동하고 `POST /workspace/chat/dialogize`(§5)를
  `first_message`와 동일한 텍스트로 호출한다. `chatroom_name` 이벤트는 오는 대로
  사이드바 제목만 갱신 — 이름 대기와 답변 대기가 직렬이 아니라 병렬이 되어
  체감 대기시간이 줄어든다.
- **[반영 완료]** [chatRoomModel.js](../src/models/chatRoomModel.js)의
  `createChatRoomRequest`가 SSE 파싱으로 구현됨(`onId`/`onName` 콜백),
  [chatRoomViewModel.js](../src/viewmodels/chatRoomViewModel.js)/
  [DashboardView.jsx](../src/features/dashboard/DashboardView.jsx)의
  `createConversationWithMessage`가 `onId` 시점에 바로 이동하도록 반영됨.

## 3. 채팅방 삭제

```
DELETE /chatroom/delete/{chatroom_id}

Request
  header  Authorization: Bearer <JWT>

Response
  Status Code
    200/204 성공
    401 Unauthorized
    404 Not Found   본인 소유가 아니거나 존재하지 않음
```

## 4. 채팅방 이름 수정

```
PATCH /chatroom/update

Request
  header  Authorization: Bearer <JWT>
  body    application/json
            chatroom_id   (long)
            chatroom_name (string)

Response
  body  없음 — 성공/실패는 상태 코드로만 판단(서버팀 확인, 아래 참고)

Status Code
  200 OK
  404 Not Found      chatroom_id를 찾을 수 없음/권한 없음
  409 Conflict       같은 이름의 채팅방이 이미 있음
  422 Unprocessable  chatroom_name 형식 오류
```

- 서버가 자동으로 이름을 짓더라도(§2), 사용자가 사이드바 "이름 바꾸기"로 수동으로
  바꾸는 기능은 그대로 유지한다.
- **[확정] 응답 바디에 `chatroom_name`을 다시 돌려줄 필요 없음** — 클라이언트가
  이미 보낸 값을 그대로 화면에 반영하면 되고, 성공/실패는 상태 코드만으로
  충분하다고 서버팀이 확인함. [chatRoomModel.js](../src/models/chatRoomModel.js)의
  `updateChatRoomTitleRequest`도 이미 응답 바디를 파싱하지 않고 상태 코드만
  본다 — 반영 완료.

## 5. 채팅 관련 API의 식별자 변경 (dashboard_id → chatroom_id)

기존 [chat-image-api-contract.md](./chat-image-api-contract.md)의 아래 두 호출은
필드명만 `dashboard_id` → `chatroom_id`로 바뀐다(요청/응답 형식, 엔드포인트 경로는
동일):

```
POST /workspace/chat/dialogize   { dashboard_id, query }  →  { chatroom_id, query }
GET  /workspace/chat/history/{dashboard_id}                →  /workspace/chat/history/{chatroom_id}
```

## 6. 미정 / 확인 필요

- [x] ~~`/chatroom/individual/*`인지 `/chatroom/*`인지~~ → **확정**: chatroom은
      공용(그룹) 계획이 따로 없어서 `individual` 구분자 자체가 불필요 —
      `/chatroom/*`로 확정(위 §1~4에 반영됨).
- [x] ~~update 응답에 chatroom_name이 필요한지~~ → **확정**: 불필요, 상태 코드로만
      판단(§4 참고).
- [ ] 위 엔드포인트들의 정확한 HTTP 메서드/세부 스펙(경로 자체는 확정)
- [x] ~~create 응답이 이름만 주는지, 첫 AI 답변까지 함께 주는지~~ → **확정**:
      SSE로 `chatroom_id`(빠름) → `chatroom_name`(느림) 두 이벤트만 준다. AI
      답변은 별도로 클라이언트가 `dialogize`(§5)를 호출해서 받는다(§2 참고).
- [ ] 요청/응답 필드명이 정말 `chatroom_id`/`chatroom_name`인지(스네이크 케이스
      확인 — 기존 `dashboard_id`/`dashboard_name` 패턴을 그대로 따른 가정)
- [ ] `chat/dialogize`, `chat/history`의 식별자가 실제로 `chatroom_id`로
      바뀌는지, 아니면 필드명은 유지한 채 값만 chatroom 기준으로 바뀌는지
- [ ] 기존 `/dashboard/individual/*`가 완전히 응답을 안 주는지(폐기), 아니면
      당분간 같이 열려 있는지

## 7. 클라이언트 상태

**이미 준비된 것**
- 대화(채팅방) 생성은 사용자가 **첫 메시지를 실제로 보낼 때만** 발생하도록
  이미 리팩터링됨([DashboardView.jsx](../src/features/dashboard/DashboardView.jsx)의
  `handleSendMessage`/`createConversationWithMessage`) — `first_message`를
  넘겨서 방을 만드는 이번 계약과 흐름이 잘 맞음
- `IS_LOCAL=true`일 때는 서버 없이 로컬에서 이름을 자동 생성(첫 메시지 앞부분을
  잘라서 사용)해서 동일한 UX로 검증 가능
- **[반영 완료]** create의 SSE 이원화(§2) — `chatRoomModel.js`/
  `chatRoomViewModel.js`/`DashboardView.jsx` 전부 `chatroom_id` 이벤트를
  받는 즉시 이동+dialogize를 시작하고, `chatroom_name` 이벤트로 사이드바
  제목만 나중에 갱신하도록 구현됨. 로컬 모드도 같은 콜백 순서(id→name)로
  동작해 UX가 서버 모드와 동일하게 검증 가능.

**아직 안 한 것**
- 실제 서버 스펙 확정 후 [chatRoomModel.js](../src/models/chatRoomModel.js)/
  [chatModel.js](../src/models/chatModel.js) 반영
- 파일 업로드 쪽 `dashboard_id` → "embedding 여부" 전환(범위 밖, §범위 참고)
