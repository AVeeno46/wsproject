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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없는 환경(http 등)에서는 조용히 무시
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
              {copied ? "✓ 복사됨" : "⧉ 복사"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
