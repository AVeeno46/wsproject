// [Component] 대시보드 왼쪽 사이드바.
// 사이드바 UI만 담당합니다.
import { useState } from "react";
import "../../styles/DashboardSidebar.css";

function DashboardSidebar({
  activeSideMenu,
  currentChatId,
  isSidebarCollapsed,
  profileLabel,
  profileName,
  profileRole,
  profileImage,
  pinnedChats = [],
  recentChats = [],
  activeChatMenuId,
  renamingChatId,
  renamingChatTitle,
  onMenuClick,
  onRecentChatClick,
  onToggleChatMenu,
  onRenameChat,
  onChangeRenameChatTitle,
  onSaveRenameChat,
  onCancelRenameChat,
  onPinChat,
  onDeleteChat,
  onToggleSidebar,
  onOpenSidebar,
  notifications = [],
  isNotificationOpen = false,
  onToggleNotification,
  onCloseNotification,
  onClearNotifications,
}) {
  const processingMenuIds = ["processing", "processing-file", "processing-api"];
  const isProcessingMenuActive = processingMenuIds.includes(activeSideMenu);

  const [isProcessingSubOpen, setIsProcessingSubOpen] = useState(
    isProcessingMenuActive
  );
  // isProcessingMenuActive가 바뀌는 순간(예: 다른 메뉴에서 자료 등록으로 이동)만
  // 하위 메뉴를 강제로 펼친다. effect 대신 렌더 중 비교하는 React 권장 패턴
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // — setState-in-effect 경고 없이 리렌더 한 번으로 처리된다.
  const [prevIsProcessingMenuActive, setPrevIsProcessingMenuActive] = useState(
    isProcessingMenuActive
  );

  if (isProcessingMenuActive !== prevIsProcessingMenuActive) {
    setPrevIsProcessingMenuActive(isProcessingMenuActive);
    if (isProcessingMenuActive) setIsProcessingSubOpen(true);
  }

  const [sidebarTooltip, setSidebarTooltip] = useState(null);

  const showSidebarTooltip = (event, text) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const sidebarRect = event.currentTarget
      .closest(".dashboardSidebar")
      ?.getBoundingClientRect();

    setSidebarTooltip({
      text,
      top: targetRect.top + targetRect.height / 2,
      left: (sidebarRect?.right || targetRect.right) + 12,
    });
  };

  const hideSidebarTooltip = () => {
    setSidebarTooltip(null);
  };

  const getTooltipProps = (text) => ({
    onMouseEnter: (event) => showSidebarTooltip(event, text),
    onMouseLeave: hideSidebarTooltip,
    onFocus: (event) => showSidebarTooltip(event, text),
    onBlur: hideSidebarTooltip,
  });

  const handleLogoClick = (event) => {
    event.stopPropagation();

    // 접힌 상태에서는 로고가 "사이드바 다시 열기" 버튼 역할만 한다
    // (접힌 상태에선 sidebarEdgeToggleBtn 자체가 숨겨져서 로고가 유일한
    // 복귀 버튼이므로, 여기서 새 대화까지 만들면 열 때마다 새 대화가 생김).
    if (isSidebarCollapsed) {
      onOpenSidebar?.();
      return;
    }

    onMenuClick?.("chat");
  };

  const handleLogoKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    handleLogoClick(event);
  };

  const handleProcessingParentClick = (event) => {
    event.stopPropagation();

    setIsProcessingSubOpen((prev) => !prev);

    if (!isProcessingMenuActive) {
      onMenuClick?.("processing-file");
    }
  };

  const renderChatItem = (chat) => {
    const isRenaming = renamingChatId === chat.id;
    const isPinned = !!chat.pinned;

    return (
      <div
        className={`sideChatItemWrap ${
          activeChatMenuId === chat.id ? "menuOpen" : ""
        } ${isRenaming ? "renaming" : ""} ${
          activeSideMenu === "chat" && currentChatId === chat.id
            ? "active"
            : ""
        }`}
        key={chat.id}
      >
        {isRenaming ? (
          <input
            className="sideChatRenameInput"
            value={renamingChatTitle}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => onChangeRenameChatTitle?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onSaveRenameChat?.();
              }

              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancelRenameChat?.();
              }
            }}
            onBlur={() => onSaveRenameChat?.()}
          />
        ) : (
          <>
            <button
              type="button"
              className="sideChatItem"
              onClick={(e) => {
                e.stopPropagation();
                onRecentChatClick?.(chat.id);
              }}
            >
              <span>{chat.title}</span>
            </button>

            <button
              type="button"
              className="sideChatMoreBtn"
              aria-label="대화 메뉴 열기"
              onClick={(e) => {
                e.stopPropagation();
                onToggleChatMenu?.(chat.id);
              }}
            >
              ⋯
            </button>

            {activeChatMenuId === chat.id && (
              <div
                className="sideChatMenu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameChat?.(chat.id);
                  }}
                >
                  이름 바꾸기
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPinChat?.(chat.id);
                  }}
                >
                  {isPinned ? "고정 해제" : "고정"}
                </button>

                <button
                  type="button"
                  className="danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat?.(chat.id);
                  }}
                >
                  삭제
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <aside className="dashboardSidebar">
      <button
        type="button"
        className="sidebarEdgeToggleBtn"
        {...getTooltipProps(isSidebarCollapsed ? "사이드바 열기" : "사이드바 닫기")}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSidebar?.();
        }}
        aria-label={isSidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        <span className={isSidebarCollapsed ? "open" : "close"} />
      </button>

      <div
        className="dashboardLogoArea dashboardLogoAreaClickable"
        role="button"
        tabIndex={0}
        onClick={handleLogoClick}
        onKeyDown={handleLogoKeyDown}
      >
        <button
          className="dashboardLogoOpenBtn"
          type="button"
          onClick={handleLogoClick}
          aria-label="새 챗봇 열기"
        >
          <img
            className="dashboardLogoMark"
            src="/assets/logo.png"
            alt="우송대 로고"
          />
          <span className="dashboardLogoSwapArrow" />
        </button>

        <div className="dashboardLogoTextGroup">
          <span>WOOSONG UNIV.</span>
          <strong>DocAI</strong>
        </div>
      </div>

      <nav className="dashboardNav dashboardSideNav">
        <div className="sideNewChatWrap">
          <button
            type="button"
            className={`sideNewChatBtn ${
              activeSideMenu === "chat" ? "active" : ""
            }`}
            {...getTooltipProps("새 채팅을 시작합니다")}
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.("chat");
            }}
          >
            <span className="sideNewChatIcon" aria-hidden="true" />
            <span>새 채팅</span>
          </button>
        </div>

        <section className="sideMenuGroup">
          <button
            type="button"
            className={`sideMenuItem ${
              activeSideMenu === "edit" ? "active" : ""
            }`}
            {...getTooltipProps("AI 검색에 등록된 자료를 확인합니다")}
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.("edit");
            }}
          >
            <span className="sideSvgIcon">
              <svg viewBox="0 0 24 24">
                <path d="M7 3.5h7l4 4V20.5H7V3.5Z" />
                <path d="M14 3.5V8h4" />
                <path d="M9.5 12h5" />
                <path d="M9.5 15h5" />
              </svg>
            </span>
            <span>등록된 자료</span>
          </button>

          <div
            className={`sideMenuWithChildren ${
              isProcessingMenuActive ? "active" : ""
            } ${isProcessingSubOpen ? "open" : ""}`}
          >
            <button
              type="button"
              className={`sideMenuItem sideMenuParentItem ${
                isProcessingMenuActive ? "active" : ""
              }`}
              {...getTooltipProps("새 HWPX 자료를 AI 검색에 등록합니다")}
              onClick={handleProcessingParentClick}
            >
              <span className="sideSvgIcon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="8.2" />
                  <path d="M8.2 12.3l2.3 2.3 5.2-5.4" />
                </svg>
              </span>

              <span>자료 등록</span>
              <span className="sideMenuChevron" aria-hidden="true" />
            </button>

            {isProcessingSubOpen && (
              <div className="sideSubMenuList">
                <button
                  type="button"
                  className={`sideSubMenuItem ${
                    activeSideMenu === "processing-file" ? "active" : ""
                  }`}
                  {...getTooltipProps("내 컴퓨터의 HWPX 파일을 등록합니다")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuClick?.("processing-file");
                  }}
                >
                  <span className="sideSubDot" />
                  <span>파일로 등록</span>
                </button>

                <button
                  type="button"
                  className={`sideSubMenuItem ${
                    activeSideMenu === "processing-api" ? "active" : ""
                  }`}
                  {...getTooltipProps("외부 자료 주소를 불러와 등록합니다")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuClick?.("processing-api");
                  }}
                >
                  <span className="sideSubDot" />
                  <span>외부 자료 등록</span>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`sideMenuItem ${
              activeSideMenu === "synonyms" ? "active" : ""
            }`}
            {...getTooltipProps("비슷한 뜻의 검색어를 관리합니다")}
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.("synonyms");
            }}
          >
            <span className="sideSvgIcon">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="sideBubbleIcon">
                <path
                  d="M6.7 5.2h10.6c1.35 0 2.45 1.1 2.45 2.45v5.7c0 1.35-1.1 2.45-2.45 2.45h-5.95l-4.15 3.15c-.55.42-1.35.03-1.35-.66V15.8H6.7c-1.35 0-2.45-1.1-2.45-2.45v-5.7c0-1.35 1.1-2.45 2.45-2.45Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M8.3 9.1h7.4" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
                <path d="M8.3 12.2h5.2" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
              </svg>
            </span>
            <span>검색어 관리</span>
          </button>
        </section>

        <section className="sideRecentSection">
          {pinnedChats.length > 0 && (
            <section className="sidePinnedSection">
              <h3>고정됨</h3>
              <div className="sideChatList">
                {pinnedChats.map((chat) => renderChatItem(chat))}
              </div>
            </section>
          )}

          <h3 className="sideRecentTitle">최근 기록</h3>

          {recentChats.length > 0 ? (
            <div className="sideChatList">
              {recentChats.map((chat) => renderChatItem(chat))}
            </div>
          ) : (
            <div className="sideRecentEmpty">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9" />
                <path d="M3.5 4.5v5h5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              <p>최근 기록이 여기에 표시됩니다.</p>
            </div>
          )}
        </section>
      </nav>

      <div className="dashboardProfileBox sideProfileBox">
        <div className="sideProfileLeft">
          <div className="dashboardProfileAvatar">
            {profileImage ? (
              <img src={profileImage} alt="프로필" />
            ) : (
              profileLabel
            )}
          </div>

          <div className="dashboardProfileMeta">
            <strong>{profileName}</strong>
            <span>{profileRole}</span>
          </div>
        </div>

        <div className="sideProfileActions" onClick={(e) => e.stopPropagation()}>
          <div className="sideNotificationWrap">
            <button
              className="sideNotificationBtn"
              type="button"
              onClick={onToggleNotification}
              aria-label="알림"
            >
              <svg viewBox="0 0 24 24" className="sideNotificationIcon">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>

              {notifications.length > 0 && (
                <span className="sideNotificationBadge">
                  {notifications.length}
                </span>
              )}
            </button>

            {isNotificationOpen && (
              <div className="sideNotificationDropdown">
                <div className="sideNotificationHeader">
                  <strong>알림</strong>
                  <span>{notifications.length}개</span>
                </div>

                <div className="sideNotificationList">
                  {notifications.length === 0 ? (
                    <div className="sideNotificationEmpty">
                      아직 알림이 없습니다.
                    </div>
                  ) : (
                    notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`sideNotificationItem ${item.type || ""}`}
                      onClick={() => {
  if (item.type === "document") {
    onMenuClick?.("edit");
  }

  onCloseNotification?.();
}}
                      >
                        <span className="sideNotificationDot"></span>

                        <span className="sideNotificationText">
                          <strong>{item.title}</strong>
                          <em>{item.message}</em>
                        </span>
                      </button>
                    ))
                  )}
                </div>

               <button
  className="sideNotificationAllBtn"
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClearNotifications?.();
  }}
  disabled={notifications.length === 0}
>
  전체 삭제
</button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`sideSettingBtn ${
              activeSideMenu === "settings" ? "active" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.("settings");
            }}
          >
            <span className="sideSvgIcon settingSvgIcon">
              <svg viewBox="0 0 24 24">
                <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A7.4 7.4 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {sidebarTooltip && (
        <div
          className="sidebarSimpleTooltip"
          style={{
            top: `${sidebarTooltip.top}px`,
            left: `${sidebarTooltip.left}px`,
          }}
        >
          {sidebarTooltip.text}
        </div>
      )}
    </aside>
  );
}

export default DashboardSidebar;
