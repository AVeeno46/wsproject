# 알림(SignalR) API 계약 — 가정치 (백엔드 확정 전)

> 이 문서는 백엔드와 아직 최종 합의되지 않은 **가정 스펙**입니다. 실제 서버 Hub가
> 나오면 이 문서와 `src/models/notificationModel.js`, `src/core/NotificationContext.jsx`를
> 함께 업데이트하세요.

## 연결

- Hub URL: `{SERVER_URL}/hubs/notifications`
- 인증: `accessTokenFactory`로 `localStorage`의 `accessToken`을 매 연결/재연결 시점에
  읽어서 전달 (REST의 `Authorization: Bearer` 헤더와 동일한 토큰, 갱신된 토큰도
  자동 반영됨)
- 재연결: `withAutomaticReconnect()` 사용 — 별도 커스텀 재시도 로직 없음

## 서버 → 클라이언트 (이벤트)

### `ReceiveNotification`
새 알림 1건이 생겼을 때 브로드캐스트.

```json
{
  "id": "string",
  "title": "string",
  "message": "string",
  "createdAt": "ISO-8601 문자열",
  "isRead": false
}
```

## 클라이언트 → 서버 (메서드)

### `MarkAsRead(notificationId: string)`
알림 하나를 읽음 처리. 반환값 없음(성공/실패는 추후 필요 시 확인 콜백 추가).

## 아직 정해지지 않은 것
- 알림 종류(카테고리)가 여러 개일 경우 이벤트를 분리할지, `type` 필드로 구분할지
- 그룹/특정 사용자 대상 브로드캐스트 방식(대화별, 역할별 등)
- 읽지 않은 알림 초기 목록을 REST로 먼저 받아올지, 연결 직후 서버가 밀어줄지
