// [Chat] 레이아웃 전용 파일 — UI 개발자가 화면 배치를 바꿀 때 편집할 유일한 파일.
// sidebar/titleBar/chatPane/docPane을 named prop(슬롯)으로만 받아서 배치합니다.
// 여기 있는 컴포넌트들은 서로의 내부 로직을 몰라도 되고, 이 파일만 고치면
// 그리드/플렉스 배치를 자유롭게 바꿀 수 있습니다.
export function ChatLayout({
  sidebar,
  titleBar,
  chatPane,
  docPane,
  onWorkspaceDragEnter,
  onWorkspaceDragOver,
  onWorkspaceDragLeave,
  onWorkspaceDrop,
  isDragging,
}) {
  return (
    <div className={`chatFeaturePage${isDragging ? " dragging" : ""}`}>
      {sidebar}

      <main
        className="chatFeatureMain"
        onDragEnter={onWorkspaceDragEnter}
        onDragOver={onWorkspaceDragOver}
        onDragLeave={onWorkspaceDragLeave}
        onDrop={onWorkspaceDrop}
      >
        {titleBar}

        <div className="chatFeatureBody">
          <div className="chatFeatureChatPane">{chatPane}</div>
          {docPane && <div className="chatFeatureDocPane">{docPane}</div>}
        </div>
      </main>
    </div>
  );
}
