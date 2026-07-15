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
GET /chatroom/individual/get-all

Request
  header  Authorization: Bearer <JWT>

Response (성공)
  body  [{ chatroom_id (long), chatroom_name (string) }]

Status Code
  200 OK
  401 Unauthorized   JWT 없음/만료
```

## 2. 채팅방 생성 (+ 첫 메시지 기반 이름 자동 생성)

```
POST /chatroom/individual/create

Request
  header  Authorization: Bearer <JWT>
  body    application/json
            first_message (string, 사용자가 처음 입력한 채팅 내용)

Response (성공)
  body  { chatroom_id (long), chatroom_name (string) }

Status Code
  200/201 성공
  400 Bad Request       first_message 비어있음
  401 Unauthorized       JWT 없음/만료
  500 Internal Server Error
```

- 클라이언트는 방 제목을 직접 짓지 않는다(기존 "새 대화", "새 대화 2" 식 클라이언트
  자동 넘버링 로직은 제거). `first_message`만 보내면 서버가 그 내용을 바탕으로
  `chatroom_name`을 만들어서 응답으로 돌려준다.
- 이 호출은 **방 생성 + 이름 생성만** 하는 것으로 가정한다. 실제 AI 응답(스트리밍
  답변)은 이 응답을 받은 뒤 클라이언트가 별도로 `POST /workspace/chat/dialogize`
  (§4)를 `first_message`와 동일한 텍스트로 호출해서 받는다 — 즉 클라이언트 입장에서
  "첫 메시지 전송"은 create 1번 + dialogize 1번, 총 2번의 요청이 된다.
  - 만약 서버가 create 응답에서 **AI 답변까지 한 번에** 주는 방식을 원한다면(요청
    1번으로 방 생성+첫 답변까지), 이 문서와 클라이언트 흐름을 다시 조정해야 한다 —
    서버팀 확인 필요(§6).

## 3. 채팅방 삭제

```
DELETE /chatroom/individual/delete/{chatroom_id}

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
PATCH /chatroom/individual/update

Request
  header  Authorization: Bearer <JWT>
  body    application/json
            chatroom_id   (long)
            chatroom_name (string)

Response
  body  { chatroom_id (long), chatroom_name (string) }

Status Code
  200 OK
  404 Not Found      chatroom_id를 찾을 수 없음/권한 없음
  409 Conflict       같은 이름의 채팅방이 이미 있음
  422 Unprocessable  chatroom_name 형식 오류
```

- 서버가 자동으로 이름을 짓더라도(§2), 사용자가 사이드바 "이름 바꾸기"로 수동으로
  바꾸는 기능은 그대로 유지한다.

## 5. 채팅 관련 API의 식별자 변경 (dashboard_id → chatroom_id)

기존 [chat-image-api-contract.md](./chat-image-api-contract.md)의 아래 두 호출은
필드명만 `dashboard_id` → `chatroom_id`로 바뀐다(요청/응답 형식, 엔드포인트 경로는
동일):

```
POST /workspace/chat/dialogize   { dashboard_id, query }  →  { chatroom_id, query }
GET  /workspace/chat/history/{dashboard_id}                →  /workspace/chat/history/{chatroom_id}
```

## 6. 미정 / 확인 필요

- [ ] 위 4개 엔드포인트의 정확한 경로/HTTP 메서드 — `/chatroom/individual/*`는
      기존 `/dashboard/individual/*` 구조를 그대로 본뜬 가정치
- [ ] `create` 응답이 이름만 주는지, 아니면 첫 AI 답변까지 함께 주는지(§2)
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

**아직 안 한 것**
- 실제 서버 스펙 확정 후 [chatRoomModel.js](../src/models/chatRoomModel.js)/
  [chatModel.js](../src/models/chatModel.js) 반영
- 파일 업로드 쪽 `dashboard_id` → "embedding 여부" 전환(범위 밖, §범위 참고)
