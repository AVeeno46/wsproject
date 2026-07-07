// [Chat] 채팅 중심 UI의 루트 화면.
// conversationId(=기존 notebookId) 유무에 따라 "대화 선택 대기" / "선택된 대화" 상태를 전환합니다.
// 기존 ViewModel(useDashboardViewModel, useSourceViewModel, useChatViewModel,
// useAuthViewModel)을 그대로 재사용하고, View만 새로 구성합니다.
// 배치(그리드/위치)는 이 파일이 아니라 layout/ChatLayout.jsx가 담당합니다.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDashboardViewModel } from "../../viewmodels/dashboardViewModel";
import { useSourceViewModel } from "../../viewmodels/sourceViewModel";
import { useChatViewModel } from "../../viewmodels/chatViewModel";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useTheme } from "../../core/ThemeContext";
import { DocPanelProvider, useDocPanel } from "./context/DocPanelContext";
import { ChatLayout } from "./layout/ChatLayout";
import { ConversationSidebar } from "./components/ConversationSidebar";
import { ConversationTitleBar } from "./components/ConversationTitleBar";
import { DeleteConversationModal } from "./components/DeleteConversationModal";
import { DeleteSourceModal } from "./components/DeleteSourceModal";
import { SettingsDropdown } from "./components/SettingsDropdown";
import { SourceSidebar } from "../note/left/SourceSidebar";
import { DocWorkspace } from "../note/center/DocWorkspace";
import { ChatPanel } from "../note/right/ChatPanel";
// 재사용하는 기존 컴포넌트(SourceSidebar/ChatPanel/DocWorkspace 등)는
// ChatPage.css의 ".chatPage" 스코프 규칙에 의존하고 있어서, 그 스타일을 그대로
// 물려받기 위해 기존 CSS도 함께 불러오고 루트에 "app chatPage" 클래스를 같이 씀.
// 이 새 폴더에서 새로 만든 요소(conversation*, chatFeature*)는 ChatFeature.css로 스타일링.
import "../../styles/ChatPage.css";
import "../../styles/ChatFeature.css";

function ChatViewInner() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();

  const { notebooks, error: conversationError, clearError: clearConversationError, createNotebook, removeNotebook, updateNotebookTitle } =
    useDashboardViewModel();

  const profileName = user?.name || "사용자";

  const { sources, isUploading, uploadError, clearUploadError, uploadFile, deleteSource } =
    useSourceViewModel(conversationId);
  const { chatHistory, isThinking, sendMessage, cancelMessage } = useChatViewModel(conversationId);

  const { activeSource, isOpen: isDocPanelOpen, open: openDocPanel, close: closeDocPanel } =
    useDocPanel();

  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);
  const [deleteConversationTarget, setDeleteConversationTarget] = useState(null);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const activeConversation = notebooks.find((n) => String(n.id) === String(conversationId)) || null;
  const conversationTitle = activeConversation?.title || "새 대화";

  useEffect(() => {
    setTitleDraft(conversationTitle);
  }, [conversationTitle]);

  // ---- 대화(노트북) 생성/제목수정/삭제 ----

  const handleCreateConversation = async () => {
    // "새 대화", "새 대화 2", "새 대화 3"… 처럼 기존 목록과 겹치지 않는 이름 생성
    // (dashboardViewModel의 이름 중복 검사에 걸리지 않게)
    const existing = new Set(notebooks.map((n) => n.title.trim()));
    let title = "새 대화";
    for (let i = 2; existing.has(title); i += 1) {
      title = `새 대화 ${i}`;
    }

    try {
      const created = await createNotebook(title);
      if (created?.id) navigate(`/chat/${created.id}`);
    } catch (error) {
      console.error("대화 생성 실패:", error);
    }
  };

  const handleTitleSave = async () => {
    const nextTitle = titleDraft.trim() || "새 대화";
    setIsTitleEditing(false);
    try {
      await updateNotebookTitle(conversationId, nextTitle);
    } catch (error) {
      console.error("대화 제목 저장 실패:", error);
    }
  };

  const handleConfirmDeleteConversation = async () => {
    if (!deleteConversationTarget) return;
    try {
      await removeNotebook(deleteConversationTarget.id);
      if (String(deleteConversationTarget.id) === String(conversationId)) {
        navigate("/chat");
      }
    } catch (error) {
      console.error("대화 삭제 실패:", error);
    } finally {
      setDeleteConversationTarget(null);
    }
  };

  // ---- 소스(업로드 파일) 삭제 ----

  const handleConfirmDeleteSource = async () => {
    if (!deleteSourceTarget) return;
    await deleteSource(String(deleteSourceTarget.id));
    if (activeSource && String(activeSource.id) === String(deleteSourceTarget.id)) {
      closeDocPanel();
    }
    setDeleteSourceTarget(null);
  };

  // ---- 워크스페이스 전체 드래그앤드롭(파일 업로드) ----

  const isExternalFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

  const handleWorkspaceDragEnter = (e) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };
  const handleWorkspaceDragOver = (e) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleWorkspaceDragLeave = (e) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };
  const handleWorkspaceDrop = (e) => {
    if (isExternalFileDrag(e)) e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
  };

  // 여러 파일을 한꺼번에 드롭해도 순차 업로드(한 파일의 업로드 응답을 받은 뒤에
  // 다음 파일을 보냄) — 서버가 업로드 응답을 임베딩 완료 시점에 돌려주는 구조와
  // 맞물려, 클라이언트가 동시에 여러 문서를 임베딩 요청하지 않도록 보장한다.
  const handleFileDrop = async (files) => {
    for (const file of files) {
      await uploadFile(file);
    }
  };

  // ---- 레이아웃 슬롯 구성 ----

  const conversations = notebooks.map((n) => ({ id: n.id, title: n.title }));

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeConversationId={conversationId}
      onSelectConversation={(id) => navigate(`/chat/${id}`)}
      onCreateConversation={handleCreateConversation}
      onRequestDelete={setDeleteConversationTarget}
      error={conversationError}
      onClearError={clearConversationError}
      profileName={profileName}
      profileLabel={user?.name ? user.name[0] : "유"}
      onOpenSettings={() => setIsSettingOpen(true)}
    />
  );

  const titleBar = conversationId ? (
    <ConversationTitleBar
      title={isTitleEditing ? titleDraft : conversationTitle}
      isEditing={isTitleEditing}
      onTitleChange={setTitleDraft}
      onStartEdit={() => {
        setTitleDraft(conversationTitle);
        setIsTitleEditing(true);
      }}
      onTitleSave={handleTitleSave}
    />
  ) : null;

  // AI가 참조한 문서 카드 클릭 → 문서 캔버스 열기
  // sourceRefs의 file_id를 현재 소스 목록에서 찾아 매칭 (없으면 id만으로 열기 시도)
  // useCallback으로 참조를 고정 — 그렇지 않으면 스트리밍 중 매 렌더마다 새 함수가
  // 생성되어 ChatMessage의 React.memo가 무력화된다.
  const handleOpenSourceRef = useCallback(
    (ref) => {
      const matched = sources.find((s) => String(s.id) === String(ref.file_id));
      openDocPanel(matched || { id: String(ref.file_id), name: ref.file_name });
    },
    [sources, openDocPanel]
  );

  const chatPane = conversationId ? (
    <ChatPanel
      chatHistory={chatHistory}
      isThinking={isThinking}
      sendMessage={sendMessage}
      cancelMessage={cancelMessage}
      onOpenSourceRef={handleOpenSourceRef}
    />
  ) : (
    <div className="chatFeatureEmptyState">
      <h2>대화를 선택하거나 새로 만들어 보세요</h2>
    </div>
  );

  const docPane = conversationId ? (
    <div className="chatFeatureDocPaneInner">
      <SourceSidebar
        sources={sources}
        isUploading={isUploading}
        uploadError={uploadError}
        clearUploadError={clearUploadError}
        uploadFile={uploadFile}
        activeSource={activeSource}
        setActiveSource={(source) => openDocPanel(source)}
        onDeleteSource={setDeleteSourceTarget}
        onSourceUploaded={(source) => source && openDocPanel(source)}
      />
      <DocWorkspace
        activeSource={activeSource}
        onDrop={handleFileDrop}
        isDragging={isDragging}
        isOpen={isDocPanelOpen}
        onClose={closeDocPanel}
      />
    </div>
  ) : null;

  return (
    <div className={`chatFeature app chatPage ${theme === "dark" ? "dark" : ""}`}>
      <ChatLayout
        sidebar={sidebar}
        titleBar={titleBar}
        chatPane={chatPane}
        docPane={docPane}
        onWorkspaceDragEnter={handleWorkspaceDragEnter}
        onWorkspaceDragOver={handleWorkspaceDragOver}
        onWorkspaceDragLeave={handleWorkspaceDragLeave}
        onWorkspaceDrop={handleWorkspaceDrop}
        isDragging={isDragging}
      />

      <DeleteConversationModal
        target={deleteConversationTarget}
        onCancel={() => setDeleteConversationTarget(null)}
        onConfirm={handleConfirmDeleteConversation}
      />

      <DeleteSourceModal
        target={deleteSourceTarget}
        onCancel={() => setDeleteSourceTarget(null)}
        onConfirm={handleConfirmDeleteSource}
      />

      <SettingsDropdown
        isOpen={isSettingOpen}
        onClose={() => setIsSettingOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        profileName={profileName}
        userRole={user?.role}
        onLogout={requestLogout}
      />
    </div>
  );
}

export function ChatView() {
  return (
    <DocPanelProvider>
      <ChatViewInner />
    </DocPanelProvider>
  );
}
