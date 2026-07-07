// [View] 오른쪽 채팅 패널.
// 대화 목록을 그리고 입력창을 제공하며, 전송 시 sendMessage(ViewModel)를 호출합니다.
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";

// cancelMessage/onOpenSourceRef/onApplyEdits 는 선택적 prop —
// 안 넘기면 각각 중지 버튼/문서카드 클릭/편집 적용 기능 없이 기존과 동일하게 동작.
export function ChatPanel({
  chatHistory,
  isThinking,
  sendMessage,
  cancelMessage,
  onOpenSourceRef,
  onApplyEdits,
}) {
  const [chatInput, setChatInput] = useState("");
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isInputScrollable, setIsInputScrollable] = useState(false);

  const chatListRef = useRef(null);
  const chatInputRef = useRef(null);
  const isNearBottomRef = useRef(true);

  // 사용자가 위로 스크롤해서 읽는 중이면 스트리밍 중에도 강제로 끌어내리지 않음.
  const SCROLL_BOTTOM_THRESHOLD = 80;
  const handleChatListScroll = (e) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD;
  };

  useEffect(() => {
    if (chatListRef.current && isNearBottomRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    if (!isThinking) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 0);
    }
  }, [isThinking]);

  const resetInputHeight = () => {
    if (!chatInputRef.current) return;

    chatInputRef.current.style.height = "22px";
    chatInputRef.current.style.overflowY = "hidden";
    setIsInputExpanded(false);
    setIsInputScrollable(false);
  };

  const resizeInput = (textarea) => {
    const maxHeight = 154;

    textarea.style.height = "22px";

    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";

    // 한 줄을 넘어가기 시작하면 ChatGPT처럼 아래 버튼줄 구조로 전환
    setIsInputExpanded(textarea.scrollHeight > 30);

    // 실제 스크롤이 필요할 때만 오른쪽 가짜 스크롤바 표시
    setIsInputScrollable(textarea.scrollHeight > maxHeight);
  };

  const handleSend = (quickText) => {
    const text = typeof quickText === "string" ? quickText : chatInput;

    if (!text.trim() || isThinking) return;

    isNearBottomRef.current = true; // 내가 보낸 메시지는 항상 맨 아래로 이동
    sendMessage(text);
    setChatInput("");
    setIsInputExpanded(false);
    setIsInputScrollable(false);

    setTimeout(() => {
      resetInputHeight();
      chatInputRef.current?.focus();
    }, 0);
  };

  return (
    <section className="rightChatPanel">
      <div className="rightChatTop">
        <h1>
          <span className="chatSparkIcon"></span>
          Woo-Song 챗봇
        </h1>
      </div>

      <div className="rightChatWelcome">
        {chatHistory.length === 0 ? (
          <>
            <div className="botTalkGroup">
              <div className="speechBubble smallBubble">
                <div className="speechText">
                  <span>안녕하세요! </span>
                  <span>무엇을 도와드릴까요?</span>
                </div>
              </div>

              <img
                className="botIcon smallBot"
                src="/assets/2.png"
                alt="마스코트"
              />
            </div>

            <p>문서 요약, 분석, 검색 등 다양한 질문을 할 수 있어요.</p>
          </>
        ) : (
          <div className="chatBubbleList" ref={chatListRef} onScroll={handleChatListScroll}>
            {chatHistory.map((msg, index) => (
              <ChatMessage
                key={msg.id || index}
                message={msg}
                isLast={index === chatHistory.length - 1}
                isThinking={isThinking}
                onOpenSourceRef={onOpenSourceRef}
                onApplyEdits={onApplyEdits}
              />
            ))}

            {isThinking && (
              <div className="thinkingRow">
                <img className="chatBotMini" src="/assets/2.png" alt="챗봇" />
                <span className="thinkingText">...</span>
              </div>
            )}
          </div>
        )}

        {chatHistory.length === 0 && (
          <div className="quickBtns sideQuickBtns">
            <button type="button" onClick={() => handleSend("문서 요약")}>
              <span className="quickIcon doc"></span>
              문서 요약
            </button>

            <button type="button" onClick={() => handleSend("주요 내용 분석")}>
              <span className="quickIcon point"></span>
              주요 내용 분석
            </button>

            <button type="button" onClick={() => handleSend("핵심 키워드 추출")}>
              <span className="quickIcon chart"></span>
              핵심 키워드 추출
            </button>
          </div>
        )}
      </div>

      <div
        className={`inputArea compactInput chatComposer ${
          isInputExpanded ? "expanded" : ""
        } ${isInputScrollable ? "scrollable" : ""}`}
      >
        <textarea
          ref={chatInputRef}
          className="chatInputTextarea"
          placeholder="질문을 입력하세요..."
          value={chatInput}
          rows={1}
          onChange={(e) => {
            setChatInput(e.target.value);
            resizeInput(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={isThinking}
        />

        <div className="chatComposerBottom">
          <div className="chatComposerTools"></div>

          {isThinking && cancelMessage ? (
            // 답변 생성 중에는 전송 버튼 대신 중지 버튼 (ChatGPT 방식)
            <button
              className="sendBtn stopBtn"
              type="button"
              onClick={cancelMessage}
              title="답변 생성 중지"
            >
              ■
            </button>
          ) : (
            <button
              className="sendBtn"
              type="button"
              onClick={() => handleSend()}
              disabled={isThinking}
            >
              ➤
            </button>
          )}
        </div>
      </div>

      <p className="notice">
        AI가 생성한 답변은 참고용이며, 정확하지 않을 수 있습니다.
      </p>
    </section>
  );
}
