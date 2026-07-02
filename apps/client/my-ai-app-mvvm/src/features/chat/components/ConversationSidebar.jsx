// [Chat] 좌측 사이드바 — 대화(기존 개인폴더/노트북) 목록.
// 데이터/로직은 부모(ChatView.jsx)가 useDashboardViewModel/useSharedFolderViewModel로 준비해서
// props로 내려줍니다. 이 컴포넌트는 목록 표시와 선택/생성/삭제 트리거만 담당합니다.
// 하단에 사용자 프로필 + 설정 트리거를 두는 ChatGPT식 배치.
import { useState } from "react";

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onCreateConversation,
  onRequestDelete,
  sharedConversations,
  isLoading,
  profileName,
  profileLabel,
  onOpenSettings,
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside className={`conversationSidebar${isOpen ? "" : " closed"}`}>
      <div className="conversationSidebarTop">
        <button
          type="button"
          className="conversationToggleBtn"
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? "사이드바 접기" : "사이드바 펼치기"}
        >
          {isOpen ? "‹" : "›"}
        </button>

        <button
          type="button"
          className="conversationCreateBtn"
          onClick={onCreateConversation}
          title="새 대화"
        >
          {isOpen ? "+ 새 대화" : "+"}
        </button>
      </div>

      {isOpen && (
        <>
          <div className="conversationList">
            {isLoading && <p className="conversationSidebarHint">불러오는 중…</p>}

            {!isLoading && conversations.length === 0 && (
              <p className="conversationSidebarHint">아직 대화가 없습니다.</p>
            )}

            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversationListItem${
                  String(conversation.id) === String(activeConversationId) ? " active" : ""
                }`}
              >
                <button
                  type="button"
                  className="conversationListItemBtn"
                  onClick={() => onSelectConversation(conversation.id)}
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
                <button
                  type="button"
                  className="conversationDeleteTriggerBtn"
                  onClick={() => onRequestDelete(conversation)}
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {sharedConversations && sharedConversations.length > 0 && (
            <div className="conversationSharedSection">
              <p className="conversationSidebarSectionTitle">공유된 대화</p>
              {sharedConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`conversationListItemBtn${
                    String(conversation.id) === String(activeConversationId) ? " active" : ""
                  }`}
                  onClick={() => onSelectConversation(conversation.id)}
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* 하단 고정: 사용자 프로필 + 설정 (ChatGPT식) */}
      <div className="conversationSidebarBottom">
        <div className="conversationProfileRow" title={profileName}>
          <div className="conversationProfileAvatar">{profileLabel}</div>
          {isOpen && <strong className="conversationProfileName">{profileName}</strong>}
          {isOpen && onOpenSettings && (
            <button
              type="button"
              className="conversationSettingTrigger"
              onClick={onOpenSettings}
              title="설정"
            >
              ⚙
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
