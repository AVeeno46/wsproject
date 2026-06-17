import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSourceViewModel } from "../../viewmodels/sourceViewModel";
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

  const { sources, isUploading, uploadFile, openSource } = useSourceViewModel(notebookId);
  const { chatHistory, isThinking, sendMessage } = useChatViewModel(notebookId);
  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [activeSource, setActiveSource] = useState(null);
  const [notebookTitle, setNotebookTitle] = useState("새 노트북");
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileDrop = (files) => {
    files.forEach((file) => uploadFile(file));
  };

  const handleSelectSource = async (source) => {
    const sourceWithUrl = await openSource(source);
    setActiveSource(sourceWithUrl);
  };

  const profileLabel = user?.name ? user.name[0] : "유";
  const profileName = user?.name || "사용자";

  return (
    <div
      className={`app chatPage ${theme === "dark" ? "dark" : ""}`}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer?.types || []).includes("Files")) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer?.types || []).includes("Files")) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
      }}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
    >
      {/* Left */}
      <SourceSidebar
        sources={sources}
        isUploading={isUploading}
        uploadFile={uploadFile}
        activeSource={activeSource}
        setActiveSource={handleSelectSource}
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
                onBlur={() => setIsTitleEditing(false)}
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
