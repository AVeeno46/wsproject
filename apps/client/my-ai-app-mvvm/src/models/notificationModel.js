// [Model] 알림(SignalR) 연결 데이터 계층.
// 실제 Hub 스펙은 docs/notification-signalr-contract.md 참고(가정치, 백엔드 확정 전).
// IS_LOCAL이면 서버 대신 가짜 connection으로 주기적인 샘플 알림을 흘려보냅니다.
import * as signalR from "@microsoft/signalr";
import { SERVER_URL, IS_LOCAL } from "../constants/constants";

const NOTIFICATION_HUB_URL = `${SERVER_URL}/hubs/notifications`;
const LOCAL_SAMPLE_INTERVAL_MS = 4000;

// [로컬] 실제 signalR 연결 없이, 같은 인터페이스(start/stop/on/invoke)를 가진
// 가짜 connection을 만들어 UI/상태 흐름을 서버 없이도 확인할 수 있게 한다.
const createLocalConnection = () => {
  let handler = null;
  let timer = null;
  let seq = 0;

  return {
    on(eventName, callback) {
      if (eventName === "ReceiveNotification") handler = callback;
    },
    start: async () => {
      timer = setInterval(() => {
        seq += 1;
        handler?.({
          id: `local-notif-${Date.now()}-${seq}`,
          title: "[로컬 테스트] 알림",
          message: `샘플 알림 ${seq}번째입니다. 서버 연결 후 실제 알림이 표시됩니다.`,
          createdAt: new Date().toISOString(),
          isRead: false,
        });
      }, LOCAL_SAMPLE_INTERVAL_MS);
    },
    stop: async () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    invoke: async () => {
      // 로컬 모드에서는 서버로 보낼 게 없으므로 아무 것도 하지 않음
    },
  };
};

// 로그인 토큰으로 알림 Hub 연결 객체를 만든다. 실제로 연결(start)하는 건
// 호출하는 쪽(NotificationContext)의 책임.
export const createNotificationConnection = (token) => {
  if (IS_LOCAL) return createLocalConnection();

  return new signalR.HubConnectionBuilder()
    .withUrl(NOTIFICATION_HUB_URL, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .build();
};
