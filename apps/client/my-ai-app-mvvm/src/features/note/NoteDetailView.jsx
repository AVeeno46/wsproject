import { useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSourceViewModel } from "../../viewmodels/sourceViewModel";
import { updateNotebookTitleRequest } from "../../models/notebookModel";
import { useChatViewModel } from "../../viewmodels/chatViewModel";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useTheme } from "../../core/ThemeContext";
import { SourceSidebar } from "./left/SourceSidebar";
import { DocWorkspace } from "./center/DocWorkspace";
import { ChatPanel } from "./right/ChatPanel";
import "../../styles/App.css";
import "../../styles/ChatPage.css";

export function NoteDetailView() {
  const { notebookId: notebookIdStr } = useParams();
  const parsed = parseInt(notebookIdStr, 10);
  const notebookId = Number.isNaN(parsed) ? notebookIdStr : parsed;
  const navigate = useNavigate();
  const location = useLocation();

  const { sources, isUploading, uploadFile, openSource, removeSource } = useSourceViewModel(notebookId);
  const { chatHistory, isThinking, sendMessage } = useChatViewModel(notebookId);
  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [activeSource, setActiveSource] = useState(null);
  const [notebookTitle, setNotebookTitle] = useState(
    location.state?.title || localStorage.getItem(`notebookTitle:${notebookIdStr}`) || "새 노트북"
  );
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);
  const dragDepthRef = useRef(0);

  const handleFileDrop = (files) => {
    files.forEach((file) => uploadFile(file));
  };

  const handleSelectSource = async (source) => {
    const sourceWithUrl = await openSource(source);
    setActiveSource(sourceWithUrl);
  };

  const handleTitleSave = async () => {
    const nextTitle = notebookTitle.trim() || "새 노트북";
    setNotebookTitle(nextTitle);
    setIsTitleEditing(false);
    localStorage.setItem(`notebookTitle:${notebookIdStr}`, nextTitle);
    try {
      await updateNotebookTitleRequest(notebookId, nextTitle);
    } catch {
      // 서버 연결 전까지 로컬 저장으로 유지
    }
  };

  const profileLabel = user?.name ? user.name[0] : "유";
  const profileName = user?.name || "사용자";

  const isExternalDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

  return (
    <div
      className={`app chatPage ${theme === "dark" ? "dark" : ""}`}
      onDragEnter={(e) => {
        if (!isExternalDrag(e)) return;
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!isExternalDrag(e)) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!isExternalDrag(e)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(e) => {
        if (isExternalDrag(e)) e.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
      }}
    >
      {/* Left */}
      <SourceSidebar
        sources={sources}
        isUploading={isUploading}
        uploadFile={uploadFile}
        activeSource={activeSource}
        setActiveSource={handleSelectSource}
        onDeleteSource={(source) => setDeleteSourceTarget(source)}
      />

      {/* Center + Right */}
      <main className="workspaceMain">
        <div className="workspaceTop">
          <div className="notebookTitleBar">
            <span className="notebookTitleIcon"></span>
            {isTitleEditing ? (
              <input
                className="notebookTitleInput"
                value={notebookTitle}
                autoFocus
                onChange={(e) => setNotebookTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
            ) : (
              <>
                <span className="notebookTitleText" onClick={() => setIsTitleEditing(true)}>
                  {notebookTitle}
                </span>
                <button className="notebookEditBtn" onClick={() => setIsTitleEditing(true)} type="button">✎</button>
              </>
            )}
          </div>

          <div className="chatTopUserArea">
            <div className="topProfileAvatar">{profileLabel}</div>
            <strong>{profileName}</strong>
            <button className="topSettingBtn" onClick={() => setIsSettingOpen(true)}>⚙ 설정</button>
          </div>
        </div>

        <div className="workspaceBody">
          <DocWorkspace
            activeSource={activeSource}
            onDrop={handleFileDrop}
            isDragging={isDragging}
          />
          <ChatPanel
            chatHistory={chatHistory}
            isThinking={isThinking}
            sendMessage={sendMessage}
          />
        </div>
      </main>

      {/* 파일 삭제 모달 */}
      {deleteSourceTarget && (
        <div className="sourceDeleteModalBg" onClick={() => setDeleteSourceTarget(null)}>
          <div className="sourceDeleteModal" onClick={(e) => e.stopPropagation()}>
            <h2>파일 삭제</h2>
            <p><strong>{deleteSourceTarget.file_name || deleteSourceTarget.name || "파일"}</strong>을 삭제하시겠습니까?</p>
            <div className="sourceDeleteActions">
              <button type="button" onClick={() => setDeleteSourceTarget(null)}>취소</button>
              <button type="button" onClick={() => {
                removeSource(deleteSourceTarget.file_id);
                if (activeSource?.file_id === deleteSourceTarget.file_id) setActiveSource(null);
                setDeleteSourceTarget(null);
              }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 설정 모달 */}
      {isSettingOpen && (
        <div className="modalBg" onClick={() => setIsSettingOpen(false)}>
          <div className="settingDropdown" onClick={(e) => e.stopPropagation()}>
            <div className="settingHoverItem">
              <button className="settingMenuItem">
                <span className="settingIcon displayIcon"></span>
                <strong>화면</strong><em>›</em>
              </button>
              <div className="settingSubMenu">
                <button onClick={() => setTheme("light")}><span className="sunMiniIcon"></span>밝은 모드</button>
                <button onClick={() => setTheme("dark")}><span className="moonMiniIcon"></span>어두운 모드</button>
              </div>
            </div>

            <div className="settingHoverItem">
              <button className="settingMenuItem">
                <span className="settingIcon accountIcon"></span>
                <strong>계정</strong><em>›</em>
              </button>
              <div className="settingSubMenu">
                <div className="accountSubInfo">
                  <strong>{profileName}</strong>
                  <p>{user?.role || "User"}</p>
                </div>
                <button className="logoutSubBtn" onClick={requestLogout}>로그아웃</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
