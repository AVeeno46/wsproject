import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./core/AuthContext";
import { ThemeProvider } from "./core/ThemeContext";
import { useAuthViewModel as useAuth } from "./viewmodels/authViewModel";

import { LoginView } from "./features/auth/LoginView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { NoteDetailView } from "./features/note/NoteDetailView";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/dashboard"
          element={
              <ProtectedRoute>
                <DashboardView />
              </ProtectedRoute>
            }
          />
          <Route path="/notebook/:notebookId"
            element={
              <ProtectedRoute>
                <NoteDetailView />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;