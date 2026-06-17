import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";

export function ChatPanel({ chatHistory, isThinking, sendMessage }) {
  const [chatInput, setChatInput] = useState("");
  const chatListRef = useRef(null);

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = (quickText) => {
    const text = typeof quickText === "string" ? quickText : chatInput;
    if (!text.trim()) return;
    sendMessage(text);
    setChatInput("");
  };

  return (
    <section className="rightChatPanel">
      <div className="rightChatTop">
        <h1><span className="chatSparkIcon"></span>Woo-Song 챗봇</h1>
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
              <img className="botIcon smallBot" src="/assets/2.png" alt="마스코트" />
            </div>
            <p>문서 요약, 분석, 검색 등 다양한 질문을 할 수 있어요.</p>
          </>
        ) : (
          <div className="chatBubbleList" ref={chatListRef}>
            {chatHistory.map((msg, index) => (
              <ChatMessage
                key={index}
                message={msg}
                isLast={index === chatHistory.length - 1}
                isThinking={isThinking}
              />
            ))}
          </div>
        )}

        {chatHistory.length === 0 && (
          <div className="quickBtns sideQuickBtns">
            <button onClick={() => handleSend("문서 요약")}>
              <span className="quickIcon doc"></span>문서 요약
            </button>
            <button onClick={() => handleSend("주요 내용 분석")}>
              <span className="quickIcon point"></span>주요 내용 분석
            </button>
            <button onClick={() => handleSend("핵심 키워드 추출")}>
              <span className="quickIcon chart"></span>핵심 키워드 추출
            </button>
          </div>
        )}
      </div>

      <div className="inputArea compactInput">
        <input
          placeholder="질문을 입력하세요..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          disabled={isThinking}
        />
        <button className="sendBtn" onClick={handleSend} disabled={isThinking}>➤</button>
      </div>
      <p className="notice">AI가 생성한 답변은 참고용이며, 정확하지 않을 수 있습니다.</p>
    </section>
  );
}
