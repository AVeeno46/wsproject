# 파일(소스) 업로드/조회 API — 연동 명세 (Client · Server)

> 클라이언트가 이미 구현해 둔 파일 업로드/목록/삭제/다운로드 흐름을 그대로 정리한 계약서.
> 지금은 `IS_LOCAL=true`([constants.js](../src/constants/constants.js))라 서버 대신
> `localStorage`로 동작 중이며, 아래 내용은 클라이언트 코드가 "서버가 이럴 것이다"라고
> 가정하고 구현해 둔 스펙이다. 서버팀 확인 후 다르면 [sourceModel.js](../src/models/sourceModel.js)
> 한 파일만 고치면 되는 구조.

**적용 범위**
- 파일 업로드(다건 순차), 목록 조회, 삭제, 뷰어용 다운로드
- 범위 밖: 업로드 진행률(%) 표시, RAG 임베딩 완료 시점 통지 — 아래 §4 참고

---

## 0. 핵심 원칙

1. **파일은 항상 특정 "대화(conversation)" 단위로 그룹핑된다.** 화면상 대시보드 페이지는
   이미 없어졌지만, 서버 API 파라미터 이름은 예전 그대로 `dashboard_id`를 쓰고 있고 클라이언트가
   그 자리에 현재 열려있는 **대화 id**(`conversationId`)를 넣어 보낸다. 화면 개념과 API 필드명이
   불일치하는 상태 — §4 참고.
2. **여러 파일을 한 번에 드롭해도 순차 업로드한다.** 한 파일의 업로드 응답을 받은 뒤에 다음
   파일을 보낸다([ChatView.jsx](../src/features/chat/ChatView.jsx)의 `handleFileDrop`) —
   서버가 동시에 여러 문서를 임베딩 요청받지 않도록 보장하기 위함. 즉 서버 입장에서 한 요청에는
   항상 파일이 1개만 들어온다.
3. **업로드 직후엔 서버 재다운로드 없이 메모리의 File 객체를 바로 쓴다.** 업로드 성공 시
   클라이언트가 이미 갖고 있던 `File` 객체를 응답 결과에 붙여서(`{ ...uploaded, file }}`)
   뷰어가 바로 열 수 있게 한다([sourceViewModel.js](../src/viewmodels/sourceViewModel.js)의
   `uploadFile`). 새로고침 후 재방문 시에만 §3.4(다운로드) 경로를 탄다.
4. **다운로드는 응답 헤더로 파일명을 받는 비표준 방식을 가정 중이다.** 서버가 실제로 이렇게
   줄 수 있는지 확인 필요 — §4 참고.

---

## 1. 아키텍처 / 데이터 흐름

```
[① 업로드]
 Client → Server : POST /workspace/file/upload (multipart/form-data)
                   dashboard_id=<conversationId>, file=<binary>
 Server          : 저장 + (RAG 임베딩은 언제 끝나는지 불명 — §4)
                   → Client : [{ file_name, file_id, fail_reason }]

[② 목록 조회 — 대화 진입 시]
 Client → Server : GET /workspace/file/get-all/{dashboard_id}
 Server          : → [{ file_id, file_name }]

[③ 삭제]
 Client → Server : DELETE /workspace/file/delete/{file_id}
 Server          : → 204/200

[④ 뷰어용 다운로드 — 새로고침 후 재방문, 또는 서버 모드에서 파일 클릭 시]
 Client → Server : GET /workspace/file/get/{file_id}
 Server          : → 파일 바이트 스트림 + 헤더 file_name
 Client          : response.body.getReader()로 청크 단위로 읽어 ArrayBuffer로 합침
                   → PdfViewer/HwpxEditor가 그 버퍼로 렌더링
```

---

## 2. API 계약

> 경로는 기존 `WorkspaceFileController` 규칙을 그대로 따름. 인증은 다른 API와 동일
> (`Authorization: Bearer <JWT>`).

### 2.1 업로드

```
POST /workspace/file/upload

Request
  header  Authorization: Bearer <JWT>
  body    multipart/form-data
            dashboard_id (string|number, 대화 id)
            file         (binary, 파일 1개)

Response (성공)
  body  [{ file_name (string), file_id (number), fail_reason (number, 0=성공) }]

Status Code
  200/201 성공 (body의 fail_reason으로 파일 단위 성공/실패 재확인)
  400 Bad Request         파일명 없음
  401 Unauthorized        JWT 없음/만료
  404 Not Found           member가 해당 dashboard_id에 미소속
  413 Payload Too Large   파일 크기 초과 (클라이언트 자체 제한 200MB, constants.js MAX_FILE_SIZE_MB)
  415 Unsupported Media   지원 안 하는 확장자
  422 Unprocessable       dashboard_id 또는 데이터 누락/형식 오류
  500 Internal Server Error
```

- 클라이언트 [sourceModel.js](../src/models/sourceModel.js)의 `uploadSourceRequest`가
  응답 배열의 **첫 번째 항목만** 사용한다 (한 요청에 파일 1개만 보내므로).
- `fail_reason` 코드별 메시지는 `FAIL_REASON_MESSAGES`(400/415/422)로 매핑돼 있음 — 실제
  서버가 내려주는 코드 종류가 이 3개가 맞는지 확인 필요.

### 2.2 목록 조회

```
GET /workspace/file/get-all/{dashboard_id}

Request
  header  Authorization: Bearer <JWT>

Response
  body  [{ file_id (number), file_name (string) }]

Status Code
  200 OK
  401 Unauthorized
  404 Not Found         해당 dashboard_id 없음/미소속
  500 Internal Server Error
```

### 2.3 삭제

```
DELETE /workspace/file/delete/{file_id}

Request
  header  Authorization: Bearer <JWT>

Status Code
  200/204 성공
  401 Unauthorized
  404 Not Found         file_id 없음
  500 Internal Server Error
```

### 2.4 다운로드(뷰어용)

```
GET /workspace/file/get/{file_id}

Request
  header  Authorization: Bearer <JWT>

Response
  header  file_name: <원본 파일명>   ← 커스텀 응답 헤더, §4에서 확인 필요
  body    파일 바이너리 (스트림)

Status Code
  200 OK
  401 Unauthorized
  404 Not Found         file_id 없음 / 권한 없음
  500 Internal Server Error
```

- 클라이언트가 `response.body.getReader()`로 청크를 읽어 하나의 `ArrayBuffer`로 합친다
  ([sourceModel.js:164-197](../src/models/sourceModel.js)). 서버가 진짜 스트리밍으로
  내려주는지, 아니면 일반 응답을 클라이언트가 리더로 받는 것뿐인지는 무관하게 동작한다.

---

## 3. 역할 분담

| 책임 | Client | Server |
|---|:---:|:---:|
| 업로드 순차 처리(동시 임베딩 방지) | ✅ | |
| 클라이언트 측 1차 유효성 검사(용량/필드 존재) | ✅ | |
| 파일 저장 + RAG 임베딩 트리거 | | ✅ |
| 파일-대화 소속 검증(권한) | | ✅ |
| 업로드 직후 미리보기(File 객체 재사용) | ✅ | |
| 새로고침 후 재열람용 다운로드 스트리밍 | | ✅ |

---

## 4. 미정 / 확인 필요

- [ ] **`dashboard_id` 필드명 유지 여부** — 화면상 "대시보드"는 이미 없어지고 "대화
      (conversation)" 단위로 재편됐는데, API 파라미터명은 예전 그대로다. 이름을
      `conversation_id`/`notebook_id`로 바꿀지, URL 경로에 포함시킬지, 아니면 그대로
      body 필드로 유지할지 확인 필요. (바뀌어도 `sourceModel.js` 한 파일만 수정하면 됨)
- [ ] **업로드 응답이 항상 배열인지** — 클라이언트는 파일 1개씩만 보내므로 배열의 첫 항목만
      쓰는데, 서버가 단일 객체로 응답할 수도 있는지 확인
- [ ] **`fail_reason` 코드 종류** — 지금 400/415/422 3가지만 매핑해 둠, 실제 값 종류 확인
- [ ] **다운로드 응답의 `file_name` 헤더** — 비표준 커스텀 헤더 방식인데 실제로 이렇게
      내려줄 수 있는지, 아니면 JSON 래핑(`{ file_name, data(base64) }`) 등 다른 방식이어야
      하는지
- [ ] **다운로드가 진짜 스트리밍인지** — 대용량 파일에서 진행률 UI를 붙이려면 진짜 청크
      스트리밍이어야 함(현재는 있으면 좋고 없어도 동작엔 지장 없음)
- [ ] **업로드 완료 시점 = RAG 임베딩 완료 시점인지** — 업로드 응답(`fail_reason=0`)이 오면
      바로 RAG 검색 대상이 되는지, 아니면 별도 완료 신호(웹소켓/폴링)가 필요한지
      ([chat-image-api-contract.md](./chat-image-api-contract.md)와도 연결되는 항목)
- [ ] **`MAX_FILE_SIZE_MB`(200MB) 클라이언트 제한값**이 서버 설정과 일치하는지

---

## 5. 클라이언트 상태

**이미 준비된 것**
- 업로드/목록/삭제/다운로드 4개 API 모두 위 스펙대로 요청 조립 완료
  ([sourceModel.js](../src/models/sourceModel.js))
- 401 자동 토큰 재발급 + 1회 재시도(`apiFetch`, [modelUtils.js](../src/models/modelUtils.js))
- 업로드/목록/삭제 실패 시 에러 메시지를 화면에 노출(`uploadError`,
  [SourceSidebar.jsx](../src/features/note/left/SourceSidebar.jsx))
- `IS_LOCAL=true`일 때는 4개 API 전부 `localStorage`로 대체 동작(서버 없이 UI 검증 가능)

**아직 안 한 것**
- 업로드 진행률(%) 표시 — 지금은 `isUploading` 불리언 하나뿐, 개수 카운터도 없음. `fetch`
  기반이라 진짜 %가 필요하면 `XMLHttpRequest`로 교체해야 함(범위 밖, 필요시 별도 작업)
- `dashboard_id` → 실제 서버 확정 필드명으로 교체(§4 확정 후)
