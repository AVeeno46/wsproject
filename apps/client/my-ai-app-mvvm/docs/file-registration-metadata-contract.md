# 자료 등록 메타데이터(사업단/주제/설명) + 외부 자료 등록 — 가정 계약 (Client · Server)

> [file-upload-api-contract.md](./file-upload-api-contract.md)의 연장선. 서버팀과
> 아직 확정되지 않은 상태에서, 클라이언트가 "서버가 이렇게 받아줄 것이다"라고
> 가정하고 먼저 화면과 코드를 만들어 둔 스펙이다. 실제 스펙이 나오면 이 문서와
> [sourceModel.js](../src/models/sourceModel.js) 한 파일만 고치면 되는 구조.

**적용 범위**
- 파일 업로드 시 사업단/주제/설명 메타데이터 동봉
- 외부 자료(URL) 등록이라는 새 등록 방식 추가
- 범위 밖: 사업단/주제 목록 자체를 서버에서 내려받는 것(§3 참고), 등록 진행률(%)

---

## 1. 업로드 메타데이터 추가 (기존 §2.1 확장)

```
POST /workspace/file/upload   (file-upload-api-contract.md §2.1과 동일 + 아래 필드 추가)

Request
  body  multipart/form-data
          dashboard_id (기존)
          file         (기존)
          business     (string, 사업단 — 선택)
          topic        (string, 주제 분류 — 선택)
          description  (string, 설명 — 선택)

Response  기존과 동일 [{ file_name, file_id, fail_reason }]
```

- 값이 없으면 필드 자체를 보내지 않는다(빈 문자열 전송 안 함).
- 서버가 이 필드들을 무시하거나 저장만 하고 응답에 그대로 돌려주지 않아도
  클라이언트 동작에는 지장 없음 — 클라이언트가 로컬에서 자체적으로 들고 있다가
  화면에 표시.

## 2. 외부 자료 등록 (신규 엔드포인트, 가정)

```
POST /workspace/file/register-external

Request
  header  Authorization: Bearer <JWT>
  body    application/json
            dashboard_id (string|number, 대화 id)
            url          (string, 외부 자료 주소)
            title        (string, 자료 제목)
            business     (string, 사업단 — 선택)
            topic        (string, 주제 분류 — 선택)
            description  (string, 설명 — 선택)

Response (성공)
  body  { file_name (string), file_id (number), fail_reason (number, 0=성공) }

Status Code
  200/201 성공
  400 Bad Request       url/title 없음
  401 Unauthorized       JWT 없음/만료
  404 Not Found          member가 해당 dashboard_id에 미소속
  422 Unprocessable      dashboard_id 또는 데이터 누락/형식 오류
  500 Internal Server Error
```

- 응답 형태를 파일 업로드와 동일하게 맞춰서, 클라이언트가 업로드/외부등록 결과를
  같은 방식(`sources` 목록에 병합)으로 처리할 수 있게 했다.
- 실제로 서버가 이 URL을 크롤링/파싱해서 RAG 임베딩까지 하는지, 아니면 단순
  메타데이터만 저장하는지는 미정 — 서버팀 확인 필요.

## 3. 사업단 / 주제 분류 목록

지금은 서버 API가 아니라 **클라이언트 하드코딩 상수**
(`DashboardProcessingPage.jsx`의 `businessUnits`, `topicCategories`)를 그대로
쓴다. 서버가 이 목록을 관리하고 싶다면 별도 GET 엔드포인트(예:
`GET /workspace/business-units`, `GET /workspace/topics`)를 추가로 협의해야
하며, 그전까지는 클라이언트 상수가 유일한 출처다.

## 4. 진행률(%) 관련 제약

[file-upload-api-contract.md §4](./file-upload-api-contract.md)에서 이미 밝힌
대로 서버가 업로드 진행률(%)이나 임베딩 진행률을 제공하지 않는다. 따라서 이번
자료 등록 화면도 "등록 중"(processing) → "등록 완료"(ready)/"등록 오류"(failed)
2~3단계 상태만 표시하고, 프로토타입에 있던 초 단위로 올라가는 가짜 진행률
애니메이션은 제거한다.

## 5. 미정 / 확인 필요

- [ ] `register-external` 엔드포인트 자체의 존재 여부 — 서버팀 확인 필요
- [ ] 외부 URL을 서버가 실제로 가져와서(크롤링) 처리하는지, 아니면 URL만
      저장해두고 이후 별도 처리가 필요한지
- [ ] `business`/`topic`을 서버가 실제로 저장하는지, 저장한다면 검색/필터링에
      사용하는지
- [ ] 사업단/주제 목록을 서버가 관리하게 될지(§3), 계속 클라이언트 상수로
      둘지

## 6. 클라이언트 상태

**이미 준비된 것**
- 업로드에 `business`/`topic`/`description` 동봉(`sourceModel.js`의
  `uploadSourceRequest`)
- 외부 자료 등록 요청 조립(`sourceModel.js`의 `registerExternalSourceRequest`)
- `IS_LOCAL=true`일 때 두 흐름 모두 localStorage로 대체 동작(서버 없이 UI
  검증 가능), 기존 임베딩 상태 시뮬레이션(`simulateLocalEmbeddingDone`) 재사용

**아직 안 한 것**
- 사업단/주제 목록 서버 연동(§3)
- 실패한 등록 항목 재시도(원본 파일을 다시 들고 있지 않아 이번 범위에서 제외)
