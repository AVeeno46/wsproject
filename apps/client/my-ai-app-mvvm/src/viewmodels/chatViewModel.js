// [ViewModel] 채팅 화면의 상태와 로직을 담는 hook.
// 대화 목록(chatHistory) 관리, 메시지 전송, 스트리밍 응답을 화면 상태로 반영합니다.
// model(chatModel)에서 데이터를 가져오고, View(ChatPanel)는 이 hook만 사용합니다.
import { useEffect, useState } from "react";
import { fetchChatHistoryRequest, streamChatRequest } from "../models/chatModel";

const getChatStorageKey = (notebookId) => `chat_history_${notebookId}`;

const readLocalChatHistory = (notebookId) => {
  if (!notebookId) return [];

  try {
    const saved = localStorage.getItem(getChatStorageKey(notebookId));
    const parsed = saved ? JSON.parse(saved) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalChatHistory = (notebookId, history) => {
  if (!notebookId) return;

  try {
    localStorage.setItem(getChatStorageKey(notebookId), JSON.stringify(history));
  } catch {
    // localStorage 사용 불가 환경이면 현재 화면에서만 유지됩니다.
  }
};

export const useChatViewModel = (notebookId) => {
  const [chatHistory, setChatHistory] = useState(() =>
    readLocalChatHistory(notebookId)
  );
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);

  const normalizeHistory = (data) => {
    if (!Array.isArray(data)) return [];

    return data.map((message, index) => ({
      id:
        message.id ||
        `${message.role || message.sender || "message"}-${index}-${Date.now()}`,
      role: message.role || message.sender || "ai",
      text: message.text || message.content || message.message || "",
      createdAt: message.createdAt || new Date().toISOString(),
      ...message,
    }));
  };

  const fetchHistory = async (targetNotebookId = notebookId) => {
    if (!targetNotebookId) {
      setChatHistory([]);
      return;
    }

    const localHistory = readLocalChatHistory(targetNotebookId);

    // 서버 히스토리 API가 없어도 저장된 로컬 대화를 먼저 보여줌
    setChatHistory(localHistory);

    try {
      const data = await fetchChatHistoryRequest(targetNotebookId);
      const serverHistory = normalizeHistory(data);

      // 서버 기록이 있으면 서버 기준으로 맞추고, 없으면 로컬 기록 유지
      if (serverHistory.length > 0) {
        setChatHistory(serverHistory);
        saveLocalChatHistory(targetNotebookId, serverHistory);
      }
    } catch {
      setChatHistory(localHistory);
    }
  };

  const updateHistory = (updater) => {
    setChatHistory((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      saveLocalChatHistory(notebookId, next);
      return next;
    });
  };

  const sendMessage = async (userQuery) => {
    const question = String(userQuery || "").trim();

    if (!question || !notebookId) return;

    setError(null);

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    };

    const aiMessage = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "ai",
      text: "",
      createdAt: new Date().toISOString(),
    };

    updateHistory((prev) => [...prev, userMessage, aiMessage]);
    setIsThinking(true);

    let accumulated = "";

    try {
      await streamChatRequest(notebookId, question, (chunk) => {
        accumulated += chunk;
        setIsThinking(false);

        updateHistory((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;

          if (lastIndex >= 0 && updated[lastIndex].role === "ai") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              text: accumulated,
            };
          }

          return updated;
        });
      });

      if (!accumulated) {
        updateHistory((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;

          if (lastIndex >= 0 && updated[lastIndex].role === "ai") {
            updated[lastIndex] = {
              ...updated[lastIndex],
              text: "서버에서 빈 응답이 반환되었습니다.",
            };
          }

          return updated;
        });
      }
    } catch (err) {
      const message = err?.message || "답변 생성에 실패했습니다.";
      setError(message);

      updateHistory((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;

        if (lastIndex >= 0 && updated[lastIndex].role === "ai") {
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: message,
          };
        }

        return updated;
      });
    } finally {
      setIsThinking(false);
    }
  };

  useEffect(() => {
    fetchHistory(notebookId);
  }, [notebookId]);

  useEffect(() => {
    saveLocalChatHistory(notebookId, chatHistory);
  }, [notebookId, chatHistory]);

  return {
    chatHistory,
    isThinking,
    error,
    sendMessage,
  };
};