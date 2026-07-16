// [Core] 알림(SignalR) 연결과 알림 목록을 앱 전역에서 공유하는 Context.
// AuthContext의 token 유무에 따라 연결을 시작/종료합니다(로그인/로그아웃 생명주기).
// 화면(벨 아이콘/드롭다운 등)은 아직 없고, useNotifications()로 데이터만 꺼내 쓸 수 있게
// 먼저 만들어둔 상태 — UI가 나오면 이 훅에 붙이면 됩니다.
import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "./authContextValue";
import { NotificationContext } from "./notificationContextValue";
import { createNotificationConnection } from "../models/notificationModel";

export const NotificationProvider = ({ children }) => {
  const { token } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const connectionRef = useRef(null);

  useEffect(() => {
    if (!token) {
      connectionRef.current?.stop();
      connectionRef.current = null;
      // 외부 시스템(SignalR 연결)의 로그아웃 정리 — "prop 변경 시 렌더 중 조정"이
      // 아니라 연결 해제와 함께 알림 목록을 비우는 것이라 effect가 맞는 자리.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifications([]);
      return;
    }

    const connection = createNotificationConnection(token);
    connectionRef.current = connection;

    connection.on("ReceiveNotification", (notification) => {
      setNotifications((prev) => [notification, ...prev]);
    });

    connection.start().catch((error) => {
      console.error("알림 연결 실패:", error);
    });

    return () => {
      connection.stop();
      if (connectionRef.current === connection) connectionRef.current = null;
    };
  }, [token]);

  const markAsRead = (notificationId) => {
    setNotifications((prev) =>
      prev.map((n) => (String(n.id) === String(notificationId) ? { ...n, isRead: true } : n))
    );
    connectionRef.current?.invoke("MarkAsRead", notificationId).catch((error) => {
      console.error("알림 읽음 처리 실패:", error);
    });
  };

  const markAllAsRead = () => {
    notifications.filter((n) => !n.isRead).forEach((n) => markAsRead(n.id));
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, markAsRead, markAllAsRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
