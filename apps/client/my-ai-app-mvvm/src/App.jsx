// 앱의 최상위 구성. 전역 Provider(에러 안전망/인증/테마)로 감싸고,
// URL 경로에 따라 어떤 화면(View)을 보여줄지 라우팅을 정의합니다.
//   /login → 로그인, /chat, /chat/:conversationId → 채팅 중심 메인 화면
// 로그인 안 한 상태로 보호된 경로에 들어오면 /login으로 보냅니다(ProtectedRoute).
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./core/AuthContext";
import { NotificationProvider } from "./core/NotificationContext";
import { ThemeProvider } from "./core/ThemeContext";
import { ErrorBoundary } from "./core/ErrorBoundary";
import { useAuthViewModel as useAuth } from "./viewmodels/authViewModel";

import { LoginView } from "./features/auth/LoginView";
import { ChatView } from "./features/chat/ChatView";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <NotificationProvider>
      <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/chat"
            element={
              <ProtectedRoute>
                <ChatView />
              </ProtectedRoute>
            }
          />
          <Route path="/chat/:conversationId"
            element={
              <ProtectedRoute>
                <ChatView />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
      </ThemeProvider>
      </NotificationProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;