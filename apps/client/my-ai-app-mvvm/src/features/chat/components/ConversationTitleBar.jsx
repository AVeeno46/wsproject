// [Chat] 대화 상단 바 — 제목 표시/수정, 공유 버튼.
// 사용자 프로필/설정은 ConversationSidebar 하단으로 이동함 (ChatGPT식 배치).
// 순수 프레젠테이션 컴포넌트. 상태/로직은 ChatView.jsx가 소유합니다.
export function ConversationTitleBar({
  title,
  isEditing,
  onTitleChange,
  onStartEdit,
  onTitleSave,
  isAlreadyShared,
  onShare,
}) {
  return (
    <div className="conversationTitleBar">
      <div className="conversationTitleGroup">
        <span className="conversationTitleIcon"></span>
        {isEditing ? (
          <input
            className="conversationTitleInput"
            value={title}
            autoFocus
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={onTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <>
            <span className="conversationTitleText" onClick={onStartEdit}>
              {title}
            </span>
            <button className="conversationEditBtn" onClick={onStartEdit} type="button">
              ✎
            </button>
          </>
        )}
      </div>

      <div className="conversationUserArea">
        {isAlreadyShared ? (
          <button
            className="conversationShareBtn sharedDisabled"
            type="button"
            disabled
            title="이미 공유된 대화입니다"
          >
            공유 중
          </button>
        ) : (
          <button className="conversationShareBtn" type="button" onClick={onShare}>
            <svg className="conversationShareSvg" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.7 10.7L15.3 6.3" />
              <path d="M8.7 13.3L15.3 17.7" />
            </svg>
            공유
          </button>
        )}
      </div>
    </div>
  );
}
