// [View] 노트 상세 화면 (3분할: 왼쪽 소스 / 가운데 문서 / 오른쪽 채팅).
// 여러 ViewModel(소스·채팅 등)을 연결해 화면을 구성하는 메인 작업 공간입니다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useSourceViewModel } from "../../viewmodels/sourceViewModel";
import { useChatViewModel } from "../../viewmodels/chatViewModel";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useTheme } from "../../core/ThemeContext";
import { SourceSidebar } from "./left/SourceSidebar";
import { DocWorkspace } from "./center/DocWorkspace";
import { ChatPanel } from "./right/ChatPanel";
import "../../styles/App.css";
import "../../styles/ChatPage.css";
import {
  fetchNotebookByIdRequest,
  updateNotebookTitleRequest,
} from "../../models/notebookModel";

const getSourceKeys = (source) => {
  if (!source) return [];

  const keys = [];

  const name = source.name || source.file?.name || "";
  const size = source.size || source.file?.size || 0;
  const lastModified = source.lastModified || source.file?.lastModified || "";

  // id가 화면마다 새로 만들어져도 삭제 기록이 유지되도록 파일 정보 기반 key를 먼저 사용합니다.
  if (name || size || lastModified) {
    keys.push(`${name}-${size}-${lastModified}`);
  }

  if (source.id) keys.push(String(source.id));
  if (source.sourceId) keys.push(String(source.sourceId));
  if (source.fileId) keys.push(String(source.fileId));
  if (source.previewUrl) keys.push(String(source.previewUrl));

  return [...new Set(keys.filter(Boolean))];
};

const isDeletedSource = (source, deletedKeys) => {
  const sourceKeys = getSourceKeys(source);
  return sourceKeys.some((key) => deletedKeys.includes(key));
};

const getSourceName = (source) => {
  return source?.name || source?.file?.name || "선택한 파일";
};

export function NoteDetailView() {
  const { notebookId } = useParams();
  const location = useLocation();

  const isSharedFolder =
    location.state?.isSharedFolder ||
    String(notebookId).startsWith("owned-shared-");
  const readLocalArray = (key) => {
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : [];

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getSharedFolderMeta = () => {
    if (!String(notebookId).startsWith("owned-shared-")) {
      return null;
    }

    const stateSourceNotebookId = location.state?.sourceNotebookId;
    const stateTitle = location.state?.title;

    try {
      const sharedKeys = [];

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);

        if (
          key === "allSharedFolders" ||
          key === "ownedSharedFolders" ||
          key === "joinedSharedFolders" ||
          key?.startsWith("ownedSharedFolders:") ||
          key?.startsWith("joinedSharedFolders:")
        ) {
          sharedKeys.push(key);
        }
      }

      const allSharedFolders = sharedKeys.flatMap((key) => readLocalArray(key));

      const matchedFolder = allSharedFolders.find(
        (folder) => String(folder.id) === String(notebookId)
      );

      return {
        title: stateTitle || matchedFolder?.title,
        sourceNotebookId:
          stateSourceNotebookId ||
          matchedFolder?.sourceNotebookId ||
          matchedFolder?.originalNotebookId ||
          notebookId,
      };
    } catch {
      return {
        title: stateTitle,
        sourceNotebookId: stateSourceNotebookId || notebookId,
      };
    }
  };

  const sharedFolderMeta = getSharedFolderMeta();
  const sourceNotebookId = sharedFolderMeta?.sourceNotebookId || notebookId;

  const { sources, isUploading, uploadError, clearUploadError, uploadFile } =
    useSourceViewModel(sourceNotebookId);

  const chatRoomId = sourceNotebookId || notebookId;
  const { chatHistory, isThinking, sendMessage } =
    useChatViewModel(chatRoomId);

  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();

  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [activeSource, setActiveSource] = useState(null);
  const [notebookTitle, setNotebookTitle] = useState("새 폴더");
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragDepthRef = useRef(0);
  const titleBeforeEditRef = useRef("");

  const isExternalFileDrag = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes("Files");
  };

  const resetFileDrag = () => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  };

  const [deleteSourceTarget, setDeleteSourceTarget] = useState(null);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareStep, setShareStep] = useState("confirm");
  const [sharePassword, setSharePassword] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareSuccessMessage, setShareSuccessMessage] = useState("");

  useEffect(() => {
    const handleReset = () => {
      resetFileDrag();
    };

    window.addEventListener("drop", handleReset);
    window.addEventListener("dragend", handleReset);

    return () => {
      window.removeEventListener("drop", handleReset);
      window.removeEventListener("dragend", handleReset);
    };
  }, []);

  useEffect(() => {
    const loadNotebookTitle = async () => {
      if (!notebookId) return;

      const passedTitle = sharedFolderMeta?.title || location.state?.title;
      const savedTitle = localStorage.getItem(`notebookTitle:${notebookId}`);

      if (passedTitle || savedTitle) {
        const nextTitle = passedTitle || savedTitle;
        setNotebookTitle(nextTitle);
        localStorage.setItem(`notebookTitle:${notebookId}`, nextTitle);
        return;
      }

      try {
        const notebook = await fetchNotebookByIdRequest(notebookId);
        setNotebookTitle(notebook?.title || "새 폴더");
      } catch (error) {
        console.error("폴더 제목 불러오기 실패:", error);
        setNotebookTitle("새 폴더");
      }
    };

    loadNotebookTitle();
  }, [notebookId, location.state]);

  const deletedSourceStorageKey = `deletedSources:${sourceNotebookId || "unknown"}`;

  const [deletedSourceKeys, setDeletedSourceKeys] = useState(() => {
    try {
      const savedBySourceNotebook = localStorage.getItem(
        `deletedSources:${sourceNotebookId || "unknown"}`
      );
      const savedByCurrentNotebook = localStorage.getItem(
        `deletedSources:${notebookId || "unknown"}`
      );

      const sourceKeys = savedBySourceNotebook
        ? JSON.parse(savedBySourceNotebook)
        : [];
      const currentKeys = savedByCurrentNotebook
        ? JSON.parse(savedByCurrentNotebook)
        : [];

      return [...new Set([...sourceKeys, ...currentKeys])];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        deletedSourceStorageKey,
        JSON.stringify(deletedSourceKeys)
      );

      // 공유폴더 id와 원본 폴더 id가 다를 수 있어서 양쪽 key에 같이 저장합니다.
      if (notebookId && `deletedSources:${notebookId}` !== deletedSourceStorageKey) {
        localStorage.setItem(
          `deletedSources:${notebookId}`,
          JSON.stringify(deletedSourceKeys)
        );
      }
    } catch {
      // localStorage를 못 쓰는 환경이면 현재 화면에서만 삭제 처리됨
    }
  }, [deletedSourceKeys, deletedSourceStorageKey, notebookId]);

  const visibleSources = useMemo(() => {
    return sources.filter((source) => !isDeletedSource(source, deletedSourceKeys));
  }, [sources, deletedSourceKeys]);

  const openDeleteSourceModal = (targetSource) => {
    if (!targetSource) return;
    setDeleteSourceTarget(targetSource);
  };

  const confirmDeleteSource = () => {
    if (!deleteSourceTarget) return;

    const targetKeys = getSourceKeys(deleteSourceTarget);

    setDeletedSourceKeys((prev) => {
      return [...new Set([...prev, ...targetKeys])];
    });

    if (
      activeSource &&
      getSourceKeys(activeSource).some((key) => targetKeys.includes(key))
    ) {
      const nextSource =
        visibleSources.find(
          (source) =>
            !getSourceKeys(source).some((key) => targetKeys.includes(key))
        ) || null;
      setActiveSource(nextSource);
    }

    if (deleteSourceTarget.previewUrl) {
      URL.revokeObjectURL(deleteSourceTarget.previewUrl);
    }

    setDeleteSourceTarget(null);
  };

  const syncSharedFolderTitle = (targetNotebookId, nextTitle, previousTitle = "") => {
    try {
      const sharedStorageKeys = [];

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);

        if (
          key === "allSharedFolders" ||
          key === "ownedSharedFolders" ||
          key === "joinedSharedFolders" ||
          key?.startsWith("ownedSharedFolders:") ||
          key?.startsWith("joinedSharedFolders:")
        ) {
          sharedStorageKeys.push(key);
        }
      }

      sharedStorageKeys.forEach((key) => {
        const saved = localStorage.getItem(key);
        const folders = saved ? JSON.parse(saved) : [];

        if (!Array.isArray(folders)) return;

        let changed = false;

        const nextFolders = folders.map((folder) => {
          const savedSharedTitle = folder?.id
            ? localStorage.getItem(`notebookTitle:${folder.id}`)
            : null;

          const isSameSharedFolder = String(folder.id) === String(targetNotebookId);

          const isSharedFromThisNotebook =
            String(folder.sourceNotebookId) === String(targetNotebookId) ||
            String(folder.originalNotebookId) === String(targetNotebookId);

          // 예전에 만든 공유폴더는 sourceNotebookId가 없을 수 있어서
          // 이전 제목이 같던 공유폴더도 같이 동기화합니다.
          const isLegacySameTitle =
            Boolean(previousTitle) &&
            (folder.title === previousTitle || savedSharedTitle === previousTitle);

          if (!isSameSharedFolder && !isSharedFromThisNotebook && !isLegacySameTitle) {
            return folder;
          }

          changed = true;

          if (folder.id) {
            localStorage.setItem(`notebookTitle:${folder.id}`, nextTitle);
          }

          return {
            ...folder,
            title: nextTitle,
          };
        });

        if (changed) {
          localStorage.setItem(key, JSON.stringify(nextFolders));
        }
      });
    } catch (error) {
      console.error("공유폴더 제목 동기화 실패:", error);
    }
  };

  const startTitleEdit = () => {
    titleBeforeEditRef.current = notebookTitle;
    setIsTitleEditing(true);
  };

  const handleTitleSave = async () => {
    const previousTitle =
      titleBeforeEditRef.current ||
      localStorage.getItem(`notebookTitle:${notebookId}`) ||
      notebookTitle;

    const nextTitle = notebookTitle.trim() || "새 폴더";

    setNotebookTitle(nextTitle);
    setIsTitleEditing(false);
    localStorage.setItem(`notebookTitle:${notebookId}`, nextTitle);

    // 내 폴더 제목을 바꾸면, 이 폴더에서 만든 공유폴더 제목도 같이 바꿉니다.
    // 예전에 만든 공유폴더처럼 sourceNotebookId가 없는 경우도 이전 제목으로 찾아서 같이 바꿉니다.
    syncSharedFolderTitle(notebookId, nextTitle, previousTitle);

    titleBeforeEditRef.current = "";

    if (String(notebookId).startsWith("owned-shared-")) {
      return;
    }

    try {
      await updateNotebookTitleRequest(notebookId, nextTitle);
    } catch (error) {
      console.error("폴더 제목 저장 실패:", error);
    }
  };

  const handleFileDrop = (files) => {
    files.forEach((file) => uploadFile(file));
  };

  const makeSharedCode = () => {
    return `SF-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  };

  const getTodayText = () => {
    return new Date()
      .toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\.\s?/g, ".")
      .replace(/\.$/, "");
  };

  const closeShareModal = () => {
    setIsShareModalOpen(false);
    setShareStep("confirm");
    setSharePassword("");
    setShareError("");
  };

  const handleShare = () => {
    if (isSharedFolder) return;

    setShareStep("confirm");
    setSharePassword("");
    setShareError("");
    setIsShareModalOpen(true);
  };

  const handleShareNext = () => {
    setShareStep("password");
    setShareError("");
  };

  const handleShareCreate = () => {
    const password = sharePassword.trim();

    if (!password) {
      setShareError("공유폴더 암호를 입력하세요.");
      return;
    }

    if (password.length < 4) {
      setShareError("암호는 4자리 이상 입력하세요.");
      return;
    }

    const sharedFolderId = `owned-shared-${Date.now()}`;
    const sharedTitle = notebookTitle.trim() || "새 폴더";

    const newSharedFolder = {
      id: sharedFolderId,
      sourceNotebookId: sourceNotebookId,
      title: sharedTitle,
      owner: profileName,
      department: "우송대학교",
      members: 1,
      code: makeSharedCode(),
      description: `${profileName}님이 만든 공유폴더입니다.`,
      createdAt: getTodayText(),
      lastAccess: "방금 전",
      hasPassword: true,

      // 프론트 임시 테스트용입니다.
      // 실제 서버에서는 암호 원문 저장이 아니라 해시 저장으로 바꿔야 합니다.
      password,
    };

    try {
      const saved = localStorage.getItem("ownedSharedFolders");
      const previousFolders = saved ? JSON.parse(saved) : [];

      const alreadySharedIndex = previousFolders.findIndex(
        (folder) => folder.sourceNotebookId === notebookId
      );

      const nextFolders =
        alreadySharedIndex >= 0
          ? previousFolders.map((folder, index) =>
              index === alreadySharedIndex
                ? {
                    ...folder,
                    title: sharedTitle,
                    owner: profileName,
                    password,
                    hasPassword: true,
                    lastAccess: "방금 전",
                  }
                : folder
            )
          : [newSharedFolder, ...previousFolders];

      localStorage.setItem("ownedSharedFolders", JSON.stringify(nextFolders));

      const savedFolder =
        alreadySharedIndex >= 0
          ? nextFolders[alreadySharedIndex]
          : newSharedFolder;

      localStorage.setItem(`notebookTitle:${savedFolder.id}`, savedFolder.title);
      localStorage.setItem(`notebookShared:${sourceNotebookId}`, "true");
      setShareSuccessMessage("공유폴더에 추가되었습니다.");
      setTimeout(() => setShareSuccessMessage(""), 1500);
      closeShareModal();
    } catch (error) {
      console.error("공유폴더 저장 실패:", error);
      setShareError("공유폴더 저장에 실패했습니다.");
    }
  };

  const profileLabel = user?.name ? user.name[0] : "유";
  const profileName = user?.name || "사용자";

const isCurrentNotebookAlreadyShared = (() => {
  if (isSharedFolder) return true;

  const targetNotebookId = String(sourceNotebookId || notebookId);

  if (localStorage.getItem(`notebookShared:${targetNotebookId}`) === "true") {
    return true;
  }

  try {
    const sharedKeys = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);

      if (
        key === "allSharedFolders" ||
        key === "ownedSharedFolders" ||
        key?.startsWith("ownedSharedFolders:")
      ) {
        sharedKeys.push(key);
      }
    }

    return sharedKeys.some((key) => {
      const folders = JSON.parse(localStorage.getItem(key) || "[]");

      return folders.some(
        (folder) =>
          String(folder.sourceNotebookId) === targetNotebookId ||
          String(folder.originalNotebookId) === targetNotebookId
      );
    });
  } catch {
    return false;
  }
})();
  
  return (
    <div className={`app chatPage ${theme === "dark" ? "dark" : ""}`}>
      <SourceSidebar
        sources={visibleSources}
        isUploading={isUploading}
        uploadError={uploadError}
        clearUploadError={clearUploadError}
        uploadFile={uploadFile}
        activeSource={activeSource}
        setActiveSource={setActiveSource}
        onDeleteSource={openDeleteSourceModal}
      />

      <main
        className="workspaceMain"
        onDragEnter={(e) => {
          if (!isExternalFileDrag(e)) return;

          e.preventDefault();
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => {
          if (!isExternalFileDrag(e)) return;

          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          if (!isExternalFileDrag(e)) return;

          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

          if (dragDepthRef.current === 0) {
            setIsDragging(false);
          }
        }}
        onDrop={(e) => {
          if (isExternalFileDrag(e)) {
            e.preventDefault();
          }

          resetFileDrag();
        }}
      >
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            ) : (
              <>
                <span
                  className="notebookTitleText"
                  onClick={startTitleEdit}
                >
                  {notebookTitle}
                </span>
                <button
                  className="notebookEditBtn"
                  onClick={startTitleEdit}
                  type="button"
                >
                  ✎
                </button>
              </>
            )}
          </div>

          <div className="chatTopUserArea">
            <div className="topProfileAvatar">{profileLabel}</div>
            <strong>{profileName}</strong>

            <div className="topUserDivider"></div>

{isCurrentNotebookAlreadyShared ? (
  <button
    className="topShareBtn sharedDisabled"
    type="button"
    disabled
    title="이미 공유된 폴더입니다"
  >
    공유 중
  </button>
) : (
  <button className="topShareBtn" type="button" onClick={handleShare}>
    <svg
      className="topShareSvg"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.7 10.7L15.3 6.3" />
      <path d="M8.7 13.3L15.3 17.7" />
    </svg>
    공유
  </button>
)}

            <button
              className="topSettingBtn"
              onClick={() => setIsSettingOpen(true)}
              type="button"
            >
              ⚙ 설정
            </button>
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

      {shareSuccessMessage && (
        <div className="sharedToast" role="status">
          {shareSuccessMessage}
        </div>
      )}

      {isShareModalOpen && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeShareModal();
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {shareStep === "confirm" ? (
              <>
                <label>공유폴더 추가</label>

                <div className="shareConfirmBox">
                  <strong>{notebookTitle}</strong>
                  <p>이 폴더를 공유폴더에 추가하시겠습니까?</p>
                </div>

                <div className="renameActions">
                  <button type="button" onClick={closeShareModal}>
                    취소
                  </button>
                  <button type="button" onClick={handleShareNext}>
                    다음
                  </button>
                </div>
              </>
            ) : (
              <>
                <label>공유폴더 암호 설정</label>

                <div className="shareConfirmBox">
                  <strong>{notebookTitle}</strong>
                  <p>이 암호를 아는 사용자만 공유폴더에 입장할 수 있습니다.</p>
                </div>

                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => {
                    setSharePassword(e.target.value);
                    setShareError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleShareCreate();
                    if (e.key === "Escape") closeShareModal();
                  }}
                  placeholder="공유폴더 암호를 입력하세요"
                  autoFocus
                />

                {shareError && <p className="sharedPasswordError">{shareError}</p>}

                <div className="renameActions">
                  <button type="button" onClick={() => setShareStep("confirm")}>
                    이전
                  </button>
                  <button type="button" onClick={handleShareCreate}>
                    공유
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleteSourceTarget && (
        <div
          className="sourceDeleteModalBg"
          onClick={() => setDeleteSourceTarget(null)}
        >
          <div
            className="sourceDeleteModal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>파일 삭제</h2>
            <p>
              <strong>{getSourceName(deleteSourceTarget)}</strong> 파일을
              삭제하시겠습니까?
            </p>
            <div className="sourceDeleteActions">
              <button type="button" onClick={() => setDeleteSourceTarget(null)}>
                취소
              </button>
              <button type="button" onClick={confirmDeleteSource}>
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingOpen && (
        <div className="modalBg" onClick={() => setIsSettingOpen(false)}>
          <div className="settingDropdown" onClick={(e) => e.stopPropagation()}>
            <div className="settingHoverItem">
              <button className="settingMenuItem" type="button">
                <span className="settingIcon displayIcon"></span>
                <strong>화면</strong>
                <em>›</em>
              </button>
              <div className="settingSubMenu">
                <button onClick={() => setTheme("light")} type="button">
                  <span className="sunMiniIcon"></span>밝은 모드
                </button>
                <button onClick={() => setTheme("dark")} type="button">
                  <span className="moonMiniIcon"></span>어두운 모드
                </button>
              </div>
            </div>

            <div className="settingHoverItem">
              <button className="settingMenuItem" type="button">
                <span className="settingIcon accountIcon"></span>
                <strong>계정</strong>
                <em>›</em>
              </button>
              <div className="settingSubMenu">
                <div className="accountSubInfo">
                  <strong>{profileName}</strong>
                  <p>{user?.role || "User"}</p>
                </div>
                <button
                  className="logoutSubBtn"
                  onClick={requestLogout}
                  type="button"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
