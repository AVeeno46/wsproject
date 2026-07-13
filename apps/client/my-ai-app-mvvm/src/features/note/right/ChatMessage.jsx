// [View] 채팅 말풍선 하나.
// AI 메시지는 마크다운으로 렌더링하고, 서버 계약(docs/chat-image-api-contract.md)의
// 추가 청크(editProposal/sourceRefs)가 메시지에 붙어 있으면 카드로 함께 표시합니다.
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 마크다운 이미지 로드 실패 시 브라우저 기본 깨진 아이콘 대신 안내 박스로 대체.
function MarkdownImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="chatImgFallback">🖼️ 이미지를 불러올 수 없습니다{alt ? ` (${alt})` : ""}</span>;
  }

  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

// 스트리밍 중 매 청크마다 채팅 목록 전체가 리렌더링돼도, 내용이 안 바뀐
// 이전 메시지들은 다시 그리지 않도록 memo로 감싼다(마크다운 재파싱 비용 절감).
export const ChatMessage = memo(function ChatMessage({
  message,
  isLast,
  isThinking,
  onOpenSourceRef,
  onApplyEdits,
}) {
  const isUser = message.role === "user";
  const [copyState, setCopyState] = useState("idle"); // "idle" | "copied" | "failed"

  // HTTPS(또는 localhost)가 아닌 환경에서는 navigator.clipboard 자체가 없을 수 있어
  // (Clipboard API의 보안 제약) execCommand 방식으로 폴백한다. 그래도 실패하면
  // 조용히 무시하지 않고 버튼에 "복사 실패"로 눈에 보이게 알린다.
  const legacyCopy = (text) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!ok) throw new Error("execCommand copy failed");
  };

  const handleCopy = async () => {
    const text = message.text || "";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        legacyCopy(text);
      }
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <div className={`chatBubbleRow ${isUser ? "user" : "bot"}`}>
      {!isUser && (
        <img className="chatBotMini" src="/assets/2.png" alt="챗봇" />
      )}
      <div className={`chatBubble ${isUser ? "user" : "bot"}`}>
        {isUser ? (
          message.text
        ) : (
          <div className="chatMarkdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: MarkdownImage }}>
              {message.text}
            </ReactMarkdown>
          </div>
        )}
        {!isUser && isLast && isThinking && !message.text && <span>...</span>}

        {/* AI가 참조한 문서 — 클릭하면 문서 캔버스 열기 (핸들러 없으면 표시만) */}
        {!isUser && message.sourceRefs?.length > 0 && (
          <div className="chatSourceRefs">
            {message.sourceRefs.map((ref, i) => (
              <button
                key={`${ref.file_id}-${i}`}
                type="button"
                className="chatSourceRefCard"
                onClick={() => onOpenSourceRef?.(ref)}
                title={ref.file_name}
              >
                📄 {ref.file_name || `문서 #${ref.file_id}`}
              </button>
            ))}
          </div>
        )}

        {/* AI 문서 편집 제안 — [적용]은 hwpx 엔진을 가진 쪽(View 상위)이 처리 */}
        {!isUser && message.editProposal && (
          <div className="chatEditProposal">
            <p className="chatEditProposalTitle">문서 수정 제안</p>
            <ul className="chatEditProposalList">
              {message.editProposal.edits?.map((edit) => (
                <li key={edit.id}>
                  <code>{edit.id}</code> → {edit.newText}
                  {edit.reason && <em> ({edit.reason})</em>}
                </li>
              ))}
            </ul>
            {onApplyEdits && (
              <button
                type="button"
                className="chatEditApplyBtn"
                onClick={() => onApplyEdits(message.editProposal)}
              >
                적용
              </button>
            )}
          </div>
        )}

        {/* AI 답변 완료 후 도구 (복사) */}
        {!isUser && message.text && !(isLast && isThinking) && (
          <div className="chatMsgTools">
            <button
              type="button"
              className="chatCopyBtn"
              onClick={handleCopy}
              title="답변 복사"
            >
              {copyState === "copied" ? "✓ 복사됨" : copyState === "failed" ? "✕ 복사 실패" : "⧉ 복사"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
