// [View] 대시보드 화면
// 폴더 기능 제거 버전. 화면(마크업/스타일)은 다운로드 프로토타입의 새 디자인을
// 그대로 유지하고, 그 안의 가짜 로컬 상태만 실제 useChatViewModel/
// useChatRoomViewModel 등으로 교체합니다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useChatRoomViewModel } from "../../viewmodels/chatRoomViewModel";
import { useSourceViewModel } from "../../viewmodels/sourceViewModel";
import { useChatViewModel } from "../../viewmodels/chatViewModel";
import { useSynonymViewModel } from "../../viewmodels/synonymViewModel";
import { useTheme } from "../../core/useTheme";
import DashboardSidebar from "./DashboardSidebar";
import DashboardChatPage from "./DashboardChatPage";
import DashboardSettingsPage from "./DashboardSettingsPage";
import DashboardProcessingPage from "./DashboardProcessingPage";
import RagCompletedDocumentPage from "./RagCompletedDocumentPage";
import SynonymDictionaryPage from "./SynonymDictionaryPage";
import { DocWorkspace } from "../note/center/DocWorkspace";
import "../../styles/DashboardChatPage.css";
import "../../styles/DashboardSidebar.css";
import "../../styles/DashboardSettingsPage.css";
import "../../styles/DashboardProcessingPage.css";
import "../../styles/DocumentPreviewPanel.css";

import fileIconUrl from "../../assets/file.png";
import pdfIconUrl from "../../assets/pdf.png";
import hwpIconUrl from "../../assets/hwp.png";
import excelIconUrl from "../../assets/excel.png";
import pptIconUrl from "../../assets/ppt.png";
import wordIconUrl from "../../assets/word.png";

export function DashboardView() {
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeSideMenu, setActiveSideMenu] = useState("chat");

  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  // 첫 렌더에서 동기적으로 localStorage를 읽어 프로필 이미지를 복원한다.
  // effect로 미루지 않으므로 첫 렌더 깜빡임과 cascading render 경고가 없다.
  const [profileImage, setProfileImage] = useState(
    () => localStorage.getItem("docaiProfileImage") || ""
  );
  const [activeChatMenuId, setActiveChatMenuId] = useState(null);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renamingChatTitle, setRenamingChatTitle] = useState("");

  const [isDraggingInput, setIsDraggingInput] = useState(false);
  const inputDragCounterRef = useRef(0);
  const chatTextareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatMessagesEndRef = useRef(null);

  const [notifications, setNotifications] = useState([]);

  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();

  const { chatRooms, createChatRoom, removeChatRoom, updateChatRoomTitle } = useChatRoomViewModel();
  const {
    chatHistory,
    hasMoreHistory,
    isLoadingMoreHistory,
    loadMoreHistory,
    isThinking,
    sendMessage,
  } = useChatViewModel(conversationId);
  const synonymViewModel = useSynonymViewModel();
  const {
    sources,
    isUploading,
    uploadError,
    clearUploadError,
    registerFiles,
    registerExternalSource,
    deleteSource,
  } = useSourceViewModel(conversationId);

  const normalizedTheme = String(
    theme ??
      localStorage.getItem("theme") ??
      localStorage.getItem("docaiTheme") ??
      ""
  )
    .trim()
    .toLowerCase();

  const isDarkMode =
    normalizedTheme === "dark" ||
    normalizedTheme === "darkmode" ||
    normalizedTheme === "dark-mode" ||
    normalizedTheme === "어둡게" ||
    normalizedTheme === "true";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    document.body.classList.toggle("dark", isDarkMode);
    document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
    document.body.dataset.theme = isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  const savedUserData = useMemo(() => {
    try {
      const saved = localStorage.getItem("userData");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  const profileName = user?.name || savedUserData?.name || "관리자";
  const profileLabel = profileName?.[0] || "관";
  const profileRole = user?.role || savedUserData?.role || "관리자";

  useEffect(() => {
    const textarea = chatTextareaRef.current;

    if (!textarea) return;

    textarea.style.height = "auto";

    const nextHeight = Math.min(textarea.scrollHeight, 140);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 140 ? "auto" : "hidden";
  }, [chatInput]);

  const makeFileId = (file) => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  const getSelectedFileType = (fileName = "") => {
    const ext = String(fileName).split(".").pop();

    if (!ext || ext === fileName) return "FILE";

    return ext.toUpperCase();
  };

  const getSelectedFileIconSrc = (type = "") => {
    const lower = String(type).toLowerCase();

    if (lower === "pdf") return pdfIconUrl;
    if (lower === "hwp" || lower === "hwpx") return hwpIconUrl;
    if (lower === "xls" || lower === "xlsx") return excelIconUrl;
    if (lower === "ppt" || lower === "pptx") return pptIconUrl;
    if (lower === "doc" || lower === "docx") return wordIconUrl;

    return fileIconUrl;
  };

  const removeSelectedFile = (fileId) => {
    setSelectedFiles((prev) => prev.filter((item) => item.id !== fileId));
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
  };

  // 대화 고정(pin)은 서버에 저장할 API가 없어 이 브라우저의 localStorage에만
  // 저장한다 — 다른 기기/브라우저에는 동기화되지 않는 클라이언트 전용 편의
  // 기능(설정 페이지의 프로필 이미지와 같은 방식). 같은 브라우저에서 여러
  // 계정으로 로그인해도 고정 목록이 섞이지 않도록 키를 계정별로 분리한다.
  const pinnedStorageKey = `pinnedChatIds:${user?.id || savedUserData?.id || "guest"}`;

  const [pinnedChatIds, setPinnedChatIds] = useState(() => {
    try {
      // 계정별 키 도입 전(공용 "pinnedChatIds" 키)에 저장된 값이 있으면
      // 첫 로드에서 그대로 이어받는다(하위 호환).
      const saved =
        localStorage.getItem(pinnedStorageKey) ??
        localStorage.getItem("pinnedChatIds");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(pinnedStorageKey, JSON.stringify(pinnedChatIds));
    } catch {
      // localStorage 사용 불가 환경이면 이번 세션에서만 고정 상태가 유지된다.
    }
  }, [pinnedStorageKey, pinnedChatIds]);

  const pinnedChats = useMemo(
    () =>
      chatRooms
        .filter((n) => pinnedChatIds.includes(n.id))
        .map((n) => ({ id: n.id, title: n.title, pinned: true })),
    [chatRooms, pinnedChatIds]
  );

  const recentChats = useMemo(
    () =>
      chatRooms
        .filter((n) => !pinnedChatIds.includes(n.id))
        .map((n) => ({ id: n.id, title: n.title, pinned: false })),
    [chatRooms, pinnedChatIds]
  );

  const handlePinChat = (chatId) => {
    setPinnedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]
    );
    setActiveChatMenuId(null);
  };

  // 실제 chatHistory({id, role: "user"|"ai", text})를 새 UI가 기대하는
  // 메시지 형태({id, role: "user"|"assistant", content})로 변환한다.
  const chatMessages = useMemo(
    () =>
      chatHistory.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: message.text,
      })),
    [chatHistory]
  );

  // 실제로 채팅방이 생성되는 시점은 사용자가 첫 메시지를 "전송"할 때뿐이다.
  // "새 채팅"/로고 클릭만으로는 아직 아무것도 만들지 않고, 첫 메시지를 보내면
  // 그 시점에 채팅방을 만들고 그 안으로 메시지를 넣는다. 방 이름은 클라이언트가
  // 짓지 않고, 첫 메시지를 그대로 서버로 보내 서버가 생성한 이름을 받아온다
  // (docs/chatroom-api-contract.md §2). pendingFirstMessageRef는 방 생성 →
  // /chat/:id로 이동 → conversationId가 바뀐 뒤(useEffect) 그 새 방으로 메시지를
  // 실제 전송하기까지 잠깐 들고 있는 임시 버퍼다.
  const pendingFirstMessageRef = useRef(null);

  const createConversationWithMessage = async (question) => {
    try {
      const created = await createChatRoom(question);
      if (created?.id) {
        pendingFirstMessageRef.current = question;
        navigate(`/chat/${created.id}`);
      }
    } catch (error) {
      console.error("대화 생성 실패:", error);
    }

    setActiveSideMenu("chat");
  };

  const handleSendMessage = (question) => {
    if (conversationId) {
      sendMessage(question);
      return;
    }

    createConversationWithMessage(question);
  };

  useEffect(() => {
    if (!conversationId || !pendingFirstMessageRef.current) return;

    const question = pendingFirstMessageRef.current;
    pendingFirstMessageRef.current = null;
    sendMessage(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleRecentChatClick = (chatId) => {
    navigate(`/chat/${chatId}`);
    setActiveChatMenuId(null);
    handleCancelRenameChat();
    setActiveSideMenu("chat");
  };

  const handleToggleChatMenu = (chatId) => {
    setActiveChatMenuId((prev) => (prev === chatId ? null : chatId));
  };

  const handleRenameChat = (chatId) => {
    const target = chatRooms.find((n) => String(n.id) === String(chatId));

    if (!target) return;

    setRenamingChatId(chatId);
    setRenamingChatTitle(target.title || "");
    setActiveChatMenuId(null);
  };

  const handleChangeRenameChatTitle = (value) => {
    setRenamingChatTitle(value);
  };

  const handleSaveRenameChat = async () => {
    if (!renamingChatId) return;

    const nextTitle = renamingChatTitle.trim();
    const chatId = renamingChatId;

    setRenamingChatId(null);
    setRenamingChatTitle("");

    if (!nextTitle) return;

    try {
      await updateChatRoomTitle(chatId, nextTitle);
    } catch (error) {
      console.error("대화 제목 저장 실패:", error);
    }
  };

  const handleCancelRenameChat = () => {
    setRenamingChatId(null);
    setRenamingChatTitle("");
  };

  const handleDeleteChat = async (chatId) => {
    const shouldDelete = window.confirm("이 대화를 삭제할까요?");

    if (!shouldDelete) {
      setActiveChatMenuId(null);
      return;
    }

    try {
      await removeChatRoom(chatId);
      setPinnedChatIds((prev) => prev.filter((id) => id !== chatId));
      if (String(chatId) === String(conversationId)) {
        navigate("/chat");
      }
    } catch (error) {
      console.error("대화 삭제 실패:", error);
    }

    setActiveChatMenuId(null);
  };

  const handleMenuClick = (menuId) => {
    setActiveChatMenuId(null);
    handleCancelRenameChat();

    if (menuId === "chat") {
      // 노트북(대화)은 실제로 첫 메시지를 보낼 때만 생성된다(handleSendMessage
      // 참고). "새 채팅"/로고는 그냥 빈 작성 화면(/chat, conversationId 없음)으로
      // 보내기만 하고, 아무것도 만들지 않는다 — 그래서 아무 것도 치지 않고
      // 반복해서 눌러도 "새 대화" 목록이 쌓이지 않는다.
      setActiveSideMenu("chat");
      navigate("/chat");
      return;
    }

    setActiveSideMenu(menuId);
  };

  const sendSummaryRequest = (document) => {
    if (!document) return;

    if (!conversationId) {
      alert("먼저 채팅에서 대화를 선택하거나 새로 만들어 주세요.");
      setActiveSideMenu("chat");
      return;
    }

    const summaryPrompt = `${document.topic} 관련 문서 "${document.title}"의 핵심 내용을 요약해줘. 중요한 기준과 확인해야 할 내용을 함께 정리해줘.`;
    sendMessage(summaryPrompt);
    setActiveSideMenu("chat");
  };

  // "등록된 자료" 목록에서 문서를 열람하기 위한 미리보기 패널.
  // 채팅 화면 바로 옆에 열리는 자리(previewOpen 레이아웃, DashboardChatPage.css)를
  // 그대로 재사용 — document는 RagCompletedDocumentPage가 화면용으로 가공한
  // 객체라, 실제 뷰어가 필요로 하는 원본 source를 id로 다시 찾아서 연다.
  const [previewSource, setPreviewSource] = useState(null);

  const handleOpenDocumentPreview = (document) => {
    const source = sources.find((s) => String(s.id) === String(document?.id));
    if (source) setPreviewSource(source);
  };

  const handleClosePreview = () => setPreviewSource(null);

  // 미리보기가 열려 있을 때 Escape로 닫기
  useEffect(() => {
    if (!previewSource) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewSource(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewSource]);

  const handleClearNotifications = () => {
    setNotifications([]);
    setIsNotificationOpen(false);
  };

  const isFileDrag = (e) => {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  };

  const handlePickedFiles = (fileList) => {
    const files = Array.from(fileList || []);

    if (files.length === 0) return;

    setSelectedFiles((prev) => {
      const prevIds = new Set(prev.map((item) => item.id));
      const nextItems = [];

      files.forEach((file) => {
        const fileId = makeFileId(file);

        if (prevIds.has(fileId)) return;

        const type = getSelectedFileType(file.name);

        prevIds.add(fileId);
        nextItems.push({
          id: fileId,
          file,
          name: file.name,
          size: file.size,
          type,
          iconSrc: getSelectedFileIconSrc(type),
        });
      });

      const mergedFiles = [...prev, ...nextItems];

      if (mergedFiles.length > 20) {
        alert("파일은 최대 20개까지 추가할 수 있습니다.");
      }

      return mergedFiles.slice(0, 20);
    });
  };

  const handleFileSelect = (e) => {
    handlePickedFiles(e.target.files);
    e.target.value = "";
  };

  const handleInputDragEnter = (e) => {
    if (!isFileDrag(e)) return;

    e.preventDefault();
    e.stopPropagation();

    inputDragCounterRef.current += 1;
    setIsDraggingInput(true);
  };

  const handleInputDragOver = (e) => {
    if (!isFileDrag(e)) return;

    e.preventDefault();
    e.stopPropagation();

    e.dataTransfer.dropEffect = "copy";
  };

  const handleInputDragLeave = (e) => {
    if (!isFileDrag(e)) return;

    e.preventDefault();
    e.stopPropagation();

    inputDragCounterRef.current = Math.max(0, inputDragCounterRef.current - 1);

    if (inputDragCounterRef.current === 0) {
      setIsDraggingInput(false);
    }
  };

  const handleInputDrop = (e) => {
    if (!isFileDrag(e)) return;

    e.preventDefault();
    e.stopPropagation();

    inputDragCounterRef.current = 0;
    setIsDraggingInput(false);
    handlePickedFiles(e.dataTransfer.files);
  };

  const renderPlaceholderPage = (type) => {
    const pageInfo = {
      edit: {
        icon: "✎",
        title: "문서 보기",
        desc: "문서 보기 화면은 다음 단계에서 연결할 예정입니다.",
      },
      processing: {
        icon: "◷",
        title: "문서 처리",
        desc: "RAG 처리 상태 화면은 다음 단계에서 연결할 예정입니다.",
      },
    };

    const info = pageInfo[type] || pageInfo.edit;

    return (
      <section className="dashboardContent placeholderContent">
        <div className="placeholderCard">
          <div className="placeholderIcon">{info.icon}</div>
          <h2>{info.title}</h2>
          <p>{info.desc}</p>
        </div>
      </section>
    );
  };

  const renderMainContent = () => {
    if (activeSideMenu === "chat") {
      // conversationId가 없어도(= 아직 노트북이 생성되지 않은 빈 작성 화면) 입력창
      // 자체는 그대로 보여준다 — 실제 노트북 생성은 handleSendMessage가 첫 메시지를
      // 보낼 때 처리한다.
      return (
        <DashboardChatPage
          userName={profileName}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatMessages={chatMessages}
          hasMoreHistory={hasMoreHistory}
          isLoadingMoreHistory={isLoadingMoreHistory}
          onLoadMoreHistory={loadMoreHistory}
          isThinking={isThinking}
          sendMessage={handleSendMessage}
          selectedFiles={selectedFiles}
          clearSelectedFiles={clearSelectedFiles}
          removeSelectedFile={removeSelectedFile}
          getSelectedFileIconSrc={getSelectedFileIconSrc}
          isDraggingInput={isDraggingInput}
          handleInputDragEnter={handleInputDragEnter}
          handleInputDragOver={handleInputDragOver}
          handleInputDragLeave={handleInputDragLeave}
          handleInputDrop={handleInputDrop}
          handleFileSelect={handleFileSelect}
          chatTextareaRef={chatTextareaRef}
          fileInputRef={fileInputRef}
          chatMessagesEndRef={chatMessagesEndRef}
        />
      );
    }

    if (activeSideMenu === "edit") {
      return (
        <RagCompletedDocumentPage
          sources={sources}
          onRequestSummary={sendSummaryRequest}
          onOpenDocument={handleOpenDocumentPreview}
        />
      );
    }

    if (activeSideMenu === "synonyms") {
      return (
        <SynonymDictionaryPage
          items={synonymViewModel.items}
          addItem={synonymViewModel.addItem}
          updateKeyword={synonymViewModel.updateKeyword}
          updateSynonyms={synonymViewModel.updateSynonyms}
          deleteItem={synonymViewModel.deleteItem}
          save={synonymViewModel.save}
        />
      );
    }

    if (activeSideMenu === "settings") {
      return (
        <DashboardSettingsPage
          theme={theme}
          setTheme={setTheme}
          profileLabel={profileLabel}
          profileName={profileName}
          profileRole={profileRole}
          profileImage={profileImage}
          setProfileImage={setProfileImage}
          requestLogout={requestLogout}
        />
      );
    }

    if (activeSideMenu === "processing" || activeSideMenu === "processing-file") {
      return (
        <DashboardProcessingPage
          pageMode="file"
          sources={sources}
          isUploading={isUploading}
          uploadError={uploadError}
          clearUploadError={clearUploadError}
          registerFiles={registerFiles}
          registerExternalSource={registerExternalSource}
          onDeleteSource={deleteSource}
        />
      );
    }

    if (activeSideMenu === "processing-api") {
      return (
        <DashboardProcessingPage
          pageMode="api"
          sources={sources}
          isUploading={isUploading}
          uploadError={uploadError}
          clearUploadError={clearUploadError}
          registerFiles={registerFiles}
          registerExternalSource={registerExternalSource}
          onDeleteSource={deleteSource}
        />
      );
    }

    return renderPlaceholderPage(activeSideMenu);
  };

  return (
    <div
      className={`chatPage ${isDarkMode ? "dark" : ""} ${
        isSidebarCollapsed ? "sidebarCollapsed" : ""
      }`}
      onClick={() => {
        setActiveChatMenuId(null);
        setIsNotificationOpen(false);
      }}
    >
      <div className="dashboardShell">
        <DashboardSidebar
          activeSideMenu={activeSideMenu}
          currentChatId={conversationId}
          isSidebarCollapsed={isSidebarCollapsed}
          profileLabel={profileLabel}
          profileName={profileName}
          profileRole={profileRole}
          profileImage={profileImage}
          pinnedChats={pinnedChats}
          recentChats={recentChats}
          activeChatMenuId={activeChatMenuId}
          renamingChatId={renamingChatId}
          renamingChatTitle={renamingChatTitle}
          notifications={notifications}
          isNotificationOpen={isNotificationOpen}
          onToggleNotification={() => setIsNotificationOpen((prev) => !prev)}
          onCloseNotification={() => setIsNotificationOpen(false)}
          onMenuClick={handleMenuClick}
          onRecentChatClick={handleRecentChatClick}
          onToggleChatMenu={handleToggleChatMenu}
          onRenameChat={handleRenameChat}
          onChangeRenameChatTitle={handleChangeRenameChatTitle}
          onSaveRenameChat={handleSaveRenameChat}
          onCancelRenameChat={handleCancelRenameChat}
          onPinChat={handlePinChat}
          onDeleteChat={handleDeleteChat}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
          onOpenSidebar={() => setIsSidebarCollapsed(false)}
          onClearNotifications={handleClearNotifications}
        />

        <main className="dashboardMainArea">{renderMainContent()}</main>
      </div>

      {previewSource && (
        <>
          <button
            type="button"
            className="documentPreviewBackdrop"
            onClick={(e) => {
              e.stopPropagation();
              handleClosePreview();
            }}
            aria-label="문서 미리보기 닫기"
          />

          <div className="documentPreviewOverlay" onClick={(e) => e.stopPropagation()}>
            <DocWorkspace activeSource={previewSource} onClose={handleClosePreview} />
          </div>
        </>
      )}
    </div>
  );
}
