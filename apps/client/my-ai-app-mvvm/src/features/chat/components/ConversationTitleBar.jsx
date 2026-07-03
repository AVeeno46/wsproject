// [Chat] 대화 상단 바 — 제목 표시/수정.
// 사용자 프로필/설정은 ConversationSidebar 하단으로 이동함 (ChatGPT식 배치).
// 순수 프레젠테이션 컴포넌트. 상태/로직은 ChatView.jsx가 소유합니다.
export function ConversationTitleBar({
  title,
  isEditing,
  onTitleChange,
  onStartEdit,
  onTitleSave,
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
    </div>
  );
}
