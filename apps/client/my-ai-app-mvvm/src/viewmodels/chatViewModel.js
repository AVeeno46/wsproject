// [ViewModel] 채팅 화면의 상태와 로직을 담는 hook.
// 대화 목록(chatHistory) 관리, 메시지 전송, 스트리밍 응답을 화면 상태로 반영합니다.
// model(chatModel)에서 데이터를 가져오고, View(ChatPanel)는 이 hook만 사용합니다.
import { useEffect, useRef, useState } from "react";
import {
  CHAT_HISTORY_PAGE_SIZE,
  fetchChatHistoryRequest,
  streamChatRequest,
} from "../models/chatModel";

const getChatStorageKey = (conversationId) => `chat_history_${conversationId}`;

const readLocalChatHistory = (conversationId) => {
  if (!conversationId) return [];

  try {
    const saved = localStorage.getItem(getChatStorageKey(conversationId));
    const parsed = saved ? JSON.parse(saved) : [];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalChatHistory = (conversationId, history) => {
  if (!conversationId) return;

  try {
    localStorage.setItem(getChatStorageKey(conversationId), JSON.stringify(history));
  } catch {
    // localStorage 사용 불가 환경이면 현재 화면에서만 유지됩니다.
  }
};

export const useChatViewModel = (conversationId) => {
  // chatHistory = 지금 화면에 보이는 메시지(최신 쪽). 무한 스크롤로 위로
  // 올리면 hiddenOlderHistory(로컬 모드의 아직 안 보여준 과거분)에서 꺼내
  // 앞에 붙인다 — 로컬 저장은 항상 "hiddenOlderHistory + chatHistory" 전체를
  // 합쳐서 하므로, 페이지네이션으로 화면에 안 보인다고 과거 대화가 사라지지
  // 않는다.
  const [chatHistory, setChatHistory] = useState(() => {
    const full = readLocalChatHistory(conversationId);
    return full.slice(-CHAT_HISTORY_PAGE_SIZE);
  });
  const [hiddenOlderHistory, setHiddenOlderHistory] = useState(() => {
    const full = readLocalChatHistory(conversationId);
    return full.slice(0, Math.max(0, full.length - CHAT_HISTORY_PAGE_SIZE));
  });
  const [hasMoreHistory, setHasMoreHistory] = useState(
    () => hiddenOlderHistory.length > 0
  );
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  // 진행 중인 스트리밍 요청의 AbortController (질문 취소용)
  const abortRef = useRef(null);

  const normalizeHistory = (data) => {
    if (!Array.isArray(data)) return [];

    return data.map((message, index) => ({
      // 메시지 고유 id는 chat_id 필드로 통일(chatroom_id와 이름 짝을 맞춤 —
      // docs/chat-image-api-contract.md §2.2). message.id는 구버전 서버 호환용 폴백.
      id:
        message.chat_id ??
        message.id ??
        `${message.role || message.sender || "message"}-${index}-${Date.now()}`,
      role: message.role || message.sender || "ai",
      text: message.text || message.content || message.message || "",
      createdAt: message.createdAt || message.created_at || new Date().toISOString(),
      ...message,
    }));
  };

  const fetchHistory = async (targetChatRoomId = conversationId) => {
    if (!targetChatRoomId) {
      setChatHistory([]);
      setHiddenOlderHistory([]);
      setHasMoreHistory(false);
      return;
    }

    const fullLocalHistory = readLocalChatHistory(targetChatRoomId);
    const localWindow = fullLocalHistory.slice(-CHAT_HISTORY_PAGE_SIZE);
    const localHidden = fullLocalHistory.slice(
      0,
      Math.max(0, fullLocalHistory.length - CHAT_HISTORY_PAGE_SIZE)
    );

    // 서버 히스토리 API가 없어도(로컬 모드 포함) 저장된 로컬 대화를 먼저 보여줌
    setChatHistory(localWindow);
    setHiddenOlderHistory(localHidden);
    setHasMoreHistory(localHidden.length > 0);

    try {
      // 최초 로드는 최신 CHAT_HISTORY_PAGE_SIZE개만 요청(무한 스크롤 첫 페이지)
      const data = await fetchChatHistoryRequest(targetChatRoomId, {
        limit: CHAT_HISTORY_PAGE_SIZE,
      });
      const serverHistory = normalizeHistory(data);

      // 서버 기록이 있으면 서버 기준으로 맞추고, 없으면 로컬 기록 유지
      if (serverHistory.length > 0) {
        setChatHistory(serverHistory);
        // 서버가 페이지네이션을 지원한다는 가정 하에, 받은 개수가 요청한
        // limit과 같으면 이전 페이지가 더 있을 수 있다고 간주한다
        // (docs/chat-image-api-contract.md §2.2 — 정확한 has_more 플래그는 미정).
        setHasMoreHistory(serverHistory.length >= CHAT_HISTORY_PAGE_SIZE);
        setHiddenOlderHistory([]);
        saveLocalChatHistory(targetChatRoomId, serverHistory);
      }
    } catch {
      setChatHistory(localWindow);
      setHiddenOlderHistory(localHidden);
      setHasMoreHistory(localHidden.length > 0);
    }
  };

  // 메시지 목록 맨 위로 스크롤했을 때 이전 대화를 추가로 불러온다(무한 스크롤).
  const loadMoreHistory = async (targetChatRoomId = conversationId) => {
    if (!targetChatRoomId || !hasMoreHistory || isLoadingMoreHistory) return;

    setIsLoadingMoreHistory(true);

    try {
      // [로컬] 이미 localStorage에서 다 읽어와 hiddenOlderHistory에 들고 있으니,
      // 네트워크 요청 없이 그 안에서 한 페이지만 꺼내 앞에 붙인다. (서버 모드에서는
      // hiddenOlderHistory를 항상 비워두므로 이 분기를 타지 않는다.)
      if (hiddenOlderHistory.length > 0) {
        const nextChunk = hiddenOlderHistory.slice(-CHAT_HISTORY_PAGE_SIZE);
        const remaining = hiddenOlderHistory.slice(
          0,
          hiddenOlderHistory.length - nextChunk.length
        );

        setChatHistory((prev) => [...nextChunk, ...prev]);
        setHiddenOlderHistory(remaining);
        setHasMoreHistory(remaining.length > 0);
        return;
      }

      // [서버] 지금 화면에 보이는 것 중 가장 오래된 메시지의 id를 커서로 삼아
      // 그 이전 것만 추가로 요청한다.
      const oldestLoaded = chatHistory[0];
      const data = await fetchChatHistoryRequest(targetChatRoomId, {
        before: oldestLoaded?.id,
        limit: CHAT_HISTORY_PAGE_SIZE,
      });
      const olderMessages = normalizeHistory(data);

      setChatHistory((prev) => [...olderMessages, ...prev]);
      setHasMoreHistory(olderMessages.length >= CHAT_HISTORY_PAGE_SIZE);
    } catch (err) {
      setError(err.message || "이전 대화를 불러오지 못했습니다.");
    } finally {
      setIsLoadingMoreHistory(false);
    }
  };

  const updateHistory = (updater) => {
    setChatHistory((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      // 새 메시지는 항상 맨 뒤에 붙으므로, 화면에 숨겨둔 과거분(hiddenOlderHistory,
      // 페이지네이션으로 아직 안 보여준 부분) 앞에 그대로 이어 붙여서 저장해야
      // 무한 스크롤로 감춰둔 과거 대화가 저장 시 사라지지 않는다.
      saveLocalChatHistory(conversationId, [...hiddenOlderHistory, ...next]);
      return next;
    });
  };

  const sendMessage = async (userQuery) => {
    const question = String(userQuery || "").trim();

    if (!question || !conversationId) return;

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

    // 마지막 AI 메시지에 부분 갱신을 적용하는 공통 헬퍼
    const patchLastAiMessage = (patch) => {
      updateHistory((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;

        if (lastIndex >= 0 && updated[lastIndex].role === "ai") {
          updated[lastIndex] = { ...updated[lastIndex], ...patch };
        }

        return updated;
      });
    };

    // 청크마다 setState하면 대량 응답 시 리렌더링/마크다운 재파싱이 폭증하므로,
    // 텍스트는 버퍼에 모았다가 일정 주기로만 화면에 반영(배칭)한다.
    const FLUSH_INTERVAL_MS = 50;
    let flushTimer = null;
    const flushAccumulated = () => {
      flushTimer = null;
      patchLastAiMessage({ text: accumulated });
    };
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(flushAccumulated, FLUSH_INTERVAL_MS);
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatRequest(
        conversationId,
        question,
        {
          // 마크다운 텍스트 조각 — 이어붙여서 타이핑 효과
          // isThinking은 스트림이 완전히 끝날 때까지(finally) 유지한다 — 첫 글자가
          // 오자마자 꺼버리면 입력창/전송버튼이 풀려서 아직 스트리밍 중인데도 다음
          // 질문을 보낼 수 있게 되고, 그 경우 두 스트림이 같은 "마지막 메시지" 자리를
          // 동시에 덮어써서 답변이 뒤섞이는 문제가 있었다.
          onText: (chunk) => {
            accumulated += chunk;
            scheduleFlush();
          },
          // AI 문서 편집 제안 — 메시지에 editProposal 필드로 부착 (렌더는 View 담당)
          onEditProposal: (proposal) => {
            patchLastAiMessage({ editProposal: proposal });
          },
          // 답변이 참조한 문서 — 여러 개 올 수 있어 배열로 누적
          onSourceRef: (ref) => {
            updateHistory((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;

              if (lastIndex >= 0 && updated[lastIndex].role === "ai") {
                const prevRefs = updated[lastIndex].sourceRefs || [];
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  sourceRefs: [...prevRefs, ref],
                };
              }

              return updated;
            });
          },
        },
        controller.signal
      );

      // 스트림 종료 시점에 타이머보다 먼저 끝날 수 있으므로 남은 버퍼를 즉시 반영
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushAccumulated();

      if (!accumulated) {
        const wasCancelled = controller.signal.aborted;
        patchLastAiMessage({
          text: wasCancelled
            ? "답변 생성이 취소되었습니다."
            : "서버에서 빈 응답이 반환되었습니다.",
        });
      }
    } catch (err) {
      const message = err?.message || "답변 생성에 실패했습니다.";
      setError(message);
      patchLastAiMessage({ text: message });
    } finally {
      abortRef.current = null;
      setIsThinking(false);
    }
  };

  // 진행 중인 답변 생성을 중단합니다.
  // fetch 연결이 끊기면 서버도 CancellationToken으로 감지해 LLM 호출을 멈춥니다
  // (docs/chat-image-api-contract.md §0-4). 이미 받은 부분 응답은 화면에 유지됩니다.
  const cancelMessage = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsThinking(false);
  };

  // conversationId가 바뀌면 그 대화의 히스토리를 가져오는 데이터 페칭 effect —
  // 정당한 자리(React "Fetching data" 패턴).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHistory(conversationId);
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    chatHistory,
    hasMoreHistory,
    isLoadingMoreHistory,
    loadMoreHistory,
    isThinking,
    error,
    sendMessage,
    cancelMessage,
  };
};