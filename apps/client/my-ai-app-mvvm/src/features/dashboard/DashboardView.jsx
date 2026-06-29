// [View] 대시보드 화면.
// 내 노트북 목록과 공유폴더를 보여주고, 생성/삭제/공유 등의 동작을
// ViewModel(useDashboardViewModel / useSharedFolderViewModel)에 위임합니다.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardViewModel } from "../../viewmodels/dashboardViewModel";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useSharedFolderViewModel } from "../../viewmodels/sharedFolderViewModel";
import { useTheme } from "../../core/ThemeContext";
import {
  getNotebookOwnerId,
  getNotebookTitle,
  getSharedNotebookIds,
  setNotebookOwner,
  removeNotebookOwner,
  setSharedFolderTitle,
} from "../../models/sharedFolderModel";
import { getLocalSourceCount } from "../../models/sourceModel";
import { NoteCreateCard } from "./NoteCreateCard";
import { NoteTemplate } from "./NoteTemplate";
import { SharedFolderView } from "./SharedFolderView";
import "../../styles/NotebookPage.css";

export function DashboardView() {
  const navigate = useNavigate();

  const {
    notebooks,
    loading,
    createNotebook,
    removeNotebook,
    updateNotebookTitle,
  } = useDashboardViewModel();

  const { requestLogout, user } = useAuthViewModel();
  const { theme, setTheme } = useTheme();

  // ---- 순수 UI 상태 (모달 / 메뉴 / 입력) ----
  const [viewMode, setViewMode] = useState("grid");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortType, setSortType] = useState("latest");
  const [sharedFolderFilter, setSharedFolderFilter] = useState("joined");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createStep, setCreateStep] = useState("title");
  const [createPassword, setCreatePassword] = useState("");
  const [pinOverrides, setPinOverrides] = useState({});
  const [titleOverrides, setTitleOverrides] = useState({});
  const [folderType, setFolderType] = useState("my");
  const [shareTarget, setShareTarget] = useState(null);
  const [shareStep, setShareStep] = useState("confirm");
  const [sharePassword, setSharePassword] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareSuccessMessage, setShareSuccessMessage] = useState("");

  const getSavedUserData = () => {
    try {
      const saved = localStorage.getItem("userData");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  const savedUserData = getSavedUserData();

  // 현재 로그인한 사용자 기준으로 폴더 저장소를 분리합니다.
  // user가 아직 늦게 들어와도 localStorage의 userData를 같이 봐서 guest로 잘못 읽히는 것을 막습니다.
  const currentUserId = user?.id || savedUserData?.id || "guest";

  const profileLabel = user?.name ? user.name[0] : savedUserData?.name?.[0] || "유";
  const profileName = user?.name || savedUserData?.name || "사용자";

  // ---- 공유폴더 상태/로직은 ViewModel로 위임 ----
  const {
    joinedSharedFolders,
    ownedSharedFolders,
    searchResults: sharedSearchResults,
    isSharedSearching,
    isNotebookShared,
    createSharedFolder,
    shareNotebookAsFolder,
    updateOwnedSharedFolderTitle,
    deleteOwnedSharedFolder,
    leaveJoinedSharedFolder,
    joinSharedFolder,
    searchSharedFolders,
  } = useSharedFolderViewModel({ currentUserId, profileName });

  const sharedNotebookIds = getSharedNotebookIds();

  const displayNotebooks = notebooks
    .filter((n) => getNotebookOwnerId(n.id) === currentUserId)
    .map((n) => {
      const savedTitle = getNotebookTitle(n.id);
      const title = titleOverrides[n.id] || savedTitle || n.title;

      return {
        ...n,
        pinned: pinOverrides[n.id] ?? false,
        title,
        sourceCount: getLocalSourceCount(n.id),
        // 제목으로 비교하지 말고, 원본 폴더 id로만 공유 여부 판단
        isShared: sharedNotebookIds.has(String(n.id)),
      };
    });

  const filteredNotebooks = displayNotebooks.filter((note) => {
    const keyword = searchText.trim().toLowerCase();

    if (folderType === "shared") return true;
    if (!keyword) return true;

    return (note.title || "").toLowerCase().includes(keyword);
  });

  const sortedNotebooks = [...filteredNotebooks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (sortType === "title") {
      return (a.title || "").localeCompare(b.title || "", "ko");
    }

    return new Date(b.createdAt || b.id) - new Date(a.createdAt || a.id);
  });

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateTitle("");
    setCreatePassword("");
    setCreateStep("title");
  };

  const handleCreateNext = () => {
    const title = createTitle.trim();

    if (!title) {
      alert("공유폴더 제목을 입력하세요.");
      return;
    }

    setCreateStep("password");
  };

  const handleCreateSave = async () => {
    const title = createTitle.trim();

    if (!title) {
      alert(
        folderType === "shared"
          ? "공유폴더 제목을 입력하세요."
          : "폴더 제목을 입력하세요."
      );
      return;
    }

    if (folderType === "shared") {
      const password = createPassword.trim();

      if (!password) {
        alert("공유폴더 암호를 입력하세요.");
        return;
      }

      if (password.length < 4) {
        alert("암호는 4자리 이상 입력하세요.");
        return;
      }

      try {
        await createSharedFolder(title, password);
        setSharedFolderFilter("owned");
        closeCreateModal();
      } catch {
        alert("공유폴더 생성에 실패했습니다.");
      }
      return;
    }

    try {
      const newNotebook = await createNotebook(title);
      if (newNotebook?.id) {
        setNotebookOwner(newNotebook.id, currentUserId);
      }
      closeCreateModal();
      if (newNotebook?.id) navigate(`/notebook/${newNotebook.id}`);
    } catch {
      alert("폴더 생성에 실패했습니다.");
    }
  };

  const handleRenameOpen = (note) => {
    setRenameTarget(note);
    setRenameTitle(note.title || "");
    setOpenMenuId(null);
  };

  const closeShareModal = () => {
    setShareTarget(null);
    setShareStep("confirm");
    setSharePassword("");
    setShareError("");
  };

  const handleShareOpen = (note) => {
    setShareTarget(note);
    setShareStep(isNotebookShared(note) ? "already" : "confirm");
    setSharePassword("");
    setShareError("");
    setOpenMenuId(null);
  };

  const handleShareNext = () => {
    setShareStep("password");
    setShareError("");
  };

  const handleShareCreate = async () => {
    if (!shareTarget) return;

    const password = sharePassword.trim();

    if (!password) {
      setShareError("공유폴더 암호를 입력하세요.");
      return;
    }

    if (password.length < 4) {
      setShareError("암호는 4자리 이상 입력하세요.");
      return;
    }

    try {
      const { sourceNotebookId, title } = await shareNotebookAsFolder(shareTarget, password);

      // localStorage만 바꾸면 즉시 리렌더가 안 될 수 있어서 카드 상태를 한 번 갱신합니다.
      setTitleOverrides((prev) => ({ ...prev, [sourceNotebookId]: title }));

      setShareSuccessMessage("공유폴더에 추가되었습니다.");
      setTimeout(() => setShareSuccessMessage(""), 1500);

      closeShareModal();
    } catch {
      setShareError("공유폴더 등록에 실패했습니다.");
    }
  };

  const handleRenameSave = async () => {
    if (!renameTarget || !renameTitle.trim()) return;

    const nextTitle = renameTitle.trim();

    try {
      await updateNotebookTitle(renameTarget.id, nextTitle);
      setTitleOverrides((prev) => ({ ...prev, [renameTarget.id]: nextTitle }));
      setRenameTarget(null);
    } catch {
      alert("제목 수정에 실패했습니다.");
    }
  };

  const handlePin = (note) => {
    setPinOverrides((prev) => ({ ...prev, [note.id]: !prev[note.id] }));
    setOpenMenuId(null);
  };

  const handleTabChange = (nextType) => {
    setFolderType(nextType);
    setSearchText("");
    setIsSearchOpen(false);
    setSortMenuOpen(false);
    setOpenMenuId(null);
  };

  const handleSharedSearch = (nextSearchText = searchText) => {
    searchSharedFolders(nextSearchText);
  };

  const sortButtonLabel =
    folderType === "shared"
      ? sharedFolderFilter === "joined"
        ? "참가 중"
        : "내가 만든"
      : sortType === "latest"
      ? "최신 항목"
      : "제목";

  return (
    <div
      className={`notebookPage ${theme === "dark" ? "dark" : ""} ${
        folderType === "shared" ? "sharedPageOnly" : ""
      }`}
      onClick={() => {
        setOpenMenuId(null);
        setSortMenuOpen(false);
      }}
    >
      <header className="notebookTop">
        <div className="brandBox">
          <img className="logoMark" src="/assets/logo.png" alt="ㅇㅅㄷ 로고" />
          <div className="brandDivider" />
          <img className="logoText" src="/assets/logo2.png" alt="우송대학교" />
        </div>

        <div className="profileActions">
          <div className="profileCircle">{profileLabel}</div>
          <div className="profileName">{profileName}</div>
          <div className="profileDivider" />
          <button
            className="settingBtn"
            type="button"
            onClick={() => setIsSettingOpen(true)}
          >
            ⚙ 설정
          </button>
        </div>
      </header>

      <main className="notebookMain">
        <div className="tabArea">
          <div className="notebookTabs">
            <button
              type="button"
              className={`notebookTab ${folderType === "my" ? "active" : ""}`}
              onClick={() => handleTabChange("my")}
            >
              내 폴더
            </button>

            <button
              type="button"
              className={`notebookTab ${
                folderType === "shared" ? "active" : ""
              }`}
              onClick={() => handleTabChange("shared")}
            >
              공유 폴더
            </button>
          </div>
        </div>

        <div className="titleRow">
          <h1>{folderType === "my" ? "내 폴더" : "공유 폴더"}</h1>

          <div className="notebookTools">
            <div
              className={`searchBox ${
                isSearchOpen || folderType === "shared" ? "open" : ""
              } ${folderType === "shared" ? "sharedTopSearch" : ""}`}
            >
              {(isSearchOpen || folderType === "shared") && (
                <input
                  value={searchText}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setSearchText(nextValue);

                    if (folderType === "shared") {
                      handleSharedSearch(nextValue);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && folderType === "shared") {
                      handleSharedSearch();
                    }
                  }}
                  placeholder={
                    folderType === "shared"
                      ? "공유폴더 검색 (제목, 만든 사람, 공유코드)"
                      : "폴더 검색"
                  }
                  autoFocus={folderType === "shared"}
                  onClick={(e) => e.stopPropagation()}
                />
              )}

              <button
                type="button"
                aria-label="폴더 검색"
                onClick={(e) => {
                  e.stopPropagation();

                  if (folderType === "shared") {
                    handleSharedSearch();
                    return;
                  }

                  setIsSearchOpen((prev) => !prev);
                  if (isSearchOpen) setSearchText("");
                }}
              >
                <span className="searchIcon"></span>
              </button>
            </div>

            {folderType === "my" && (
              <div className="viewToggle">
                <button
                  type="button"
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewMode("grid");
                  }}
                >
                  <span className="gridIcon">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </button>

                <button
                  type="button"
                  className={viewMode === "list" ? "active" : ""}
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewMode("list");
                  }}
                >
                  <span className="listIcon">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </button>
              </div>
            )}

            <div className="sortWrap">
              <button
                className="sortBtn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSortMenuOpen((prev) => !prev);
                }}
              >
                {sortButtonLabel} ▾
              </button>

              {sortMenuOpen && (
                <div className="sortMenu" onClick={(e) => e.stopPropagation()}>
                  {folderType === "shared" ? (
                    <>
                      <button
                        className={
                          sharedFolderFilter === "joined" ? "active" : ""
                        }
                        onClick={() => {
                          setSharedFolderFilter("joined");
                          setSortMenuOpen(false);
                        }}
                      >
                        참가 중
                      </button>

                      <button
                        className={
                          sharedFolderFilter === "owned" ? "active" : ""
                        }
                        onClick={() => {
                          setSharedFolderFilter("owned");
                          setSortMenuOpen(false);
                        }}
                      >
                        내가 만든
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={sortType === "latest" ? "active" : ""}
                        onClick={() => {
                          setSortType("latest");
                          setSortMenuOpen(false);
                        }}
                      >
                        최신 항목
                      </button>

                      <button
                        className={sortType === "title" ? "active" : ""}
                        onClick={() => {
                          setSortType("title");
                          setSortMenuOpen(false);
                        }}
                      >
                        제목
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              className="createNoteBtn"
              type="button"
              onClick={() => setIsCreateOpen(true)}
            >
              {folderType === "shared"
                ? "＋ 공유 폴더 만들기"
                : "＋ 새로 만들기"}
            </button>
          </div>
        </div>

        {folderType === "shared" ? (
          <SharedFolderView
            searchText={searchText}
            sharedFolderFilter={sharedFolderFilter}
            joinedFolders={joinedSharedFolders}
            ownedFolders={ownedSharedFolders}
            searchResults={sharedSearchResults}
            isSearching={isSharedSearching}
            onOpenSharedFolder={(folder) => {
              setSharedFolderTitle(folder.id, folder.title);

              navigate(`/notebook/${folder.id}`, {
                state: {
                  title: folder.title,
                  isSharedFolder: true,
                  sourceNotebookId: folder.sourceNotebookId || folder.id,
                },
              });
            }}
            onUpdateOwnedSharedFolderTitle={updateOwnedSharedFolderTitle}
            onDeleteOwnedSharedFolder={deleteOwnedSharedFolder}
            onLeaveJoinedSharedFolder={leaveJoinedSharedFolder}
            onJoinSharedFolder={async (folderId, inputPassword) => {
              const target = await joinSharedFolder(folderId, inputPassword);

              navigate(`/notebook/${target.id}`, {
                state: {
                  title: target.title,
                  isSharedFolder: true,
                  sourceNotebookId: target.sourceNotebookId || target.id,
                },
              });
            }}
          />
        ) : (
          <>
            {loading && (
              <p style={{ padding: "20px", color: "#718198" }}>
                불러오는 중...
              </p>
            )}

            {viewMode === "grid" ? (
              <div className="noteGrid">
                <NoteCreateCard onClick={() => setIsCreateOpen(true)} />

                {sortedNotebooks.map((note) => (
                  <NoteTemplate
                    key={note.id}
                    note={note}
                    viewMode="grid"
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onOpen={(n) => navigate(`/notebook/${n.id}`)}
                    onDelete={(n) => {
                      setDeleteTarget(n);
                      setOpenMenuId(null);
                    }}
                    onRename={handleRenameOpen}
                    onPin={handlePin}
                    onShare={handleShareOpen}
                  />
                ))}
              </div>
            ) : (
              <div className="noteList">
                <div className="noteListHeader">
                  <span>제목</span>
                  <span>출처</span>
                  <span>생성일</span>
                  <span>고정</span>
                  <span></span>
                </div>

                {sortedNotebooks.map((note) => (
                  <NoteTemplate
                    key={note.id}
                    note={note}
                    viewMode="list"
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    onOpen={(n) => navigate(`/notebook/${n.id}`)}
                    onDelete={(n) => {
                      setDeleteTarget(n);
                      setOpenMenuId(null);
                    }}
                    onRename={handleRenameOpen}
                    onPin={handlePin}
                    onShare={handleShareOpen}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {isSettingOpen && (
        <div className="modalBg" onClick={() => setIsSettingOpen(false)}>
          <div className="settingDropdown" onClick={(e) => e.stopPropagation()}>
            <div className="settingHoverItem">
              <button className="settingMenuItem" type="button">
                <span className="settingIcon displayIcon"></span>
                <strong>화면</strong>
              </button>

              <div className="settingSubMenu">
                <button type="button" onClick={() => setTheme("light")}>
                  <span className="sunMiniIcon"></span>
                  밝은 모드
                </button>
                <button type="button" onClick={() => setTheme("dark")}>
                  <span className="moonMiniIcon"></span>
                  어두운 모드
                </button>
              </div>
            </div>

            <div className="settingHoverItem">
              <button className="settingMenuItem" type="button">
                <span className="settingIcon accountIcon"></span>
                <strong>계정</strong>
              </button>

              <div className="settingSubMenu">
                <div className="accountSubInfo">
                  <strong>{profileName}</strong>
                  <p>{user?.role || "User"}</p>
                </div>
                <button
                  className="logoutSubBtn"
                  type="button"
                  onClick={requestLogout}
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {folderType === "shared" ? (
              <>
                {createStep === "title" ? (
                  <>
                    <label>새 공유폴더 제목</label>

                    <input
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateNext();
                        if (e.key === "Escape") closeCreateModal();
                      }}
                      placeholder="공유폴더 제목을 입력하세요"
                      autoFocus
                    />

                    <div className="renameActions">
                      <button type="button" onClick={closeCreateModal}>
                        취소
                      </button>
                      <button type="button" onClick={handleCreateNext}>
                        다음
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label>공유폴더 암호 설정</label>

                    <div className="sharedCreateSummary">
                      <strong>{createTitle}</strong>
                      <p>
                        이 암호를 아는 사용자만 공유폴더에 입장할 수 있습니다.
                      </p>
                    </div>

                    <input
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateSave();
                        if (e.key === "Escape") closeCreateModal();
                      }}
                      placeholder="공유폴더 암호를 입력하세요"
                      autoFocus
                    />

                    <div className="renameActions">
                      <button
                        type="button"
                        onClick={() => setCreateStep("title")}
                      >
                        이전
                      </button>
                      <button type="button" onClick={handleCreateSave}>
                        생성
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <label>새 폴더 제목</label>

                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSave();
                    if (e.key === "Escape") closeCreateModal();
                  }}
                  placeholder="폴더 제목을 입력하세요"
                  autoFocus
                />

                <div className="renameActions">
                  <button type="button" onClick={closeCreateModal}>
                    취소
                  </button>
                  <button type="button" onClick={handleCreateSave}>
                    생성
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {shareSuccessMessage && (
        <div className="sharedToast" role="status">
          {shareSuccessMessage}
        </div>
      )}

      {shareTarget && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              closeShareModal();
            }
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {shareStep === "already" ? (
              <>
                <label>이미 공유 중인 폴더</label>

                <div className="shareConfirmBox alreadySharedBox">
                  <strong>{shareTarget.title}</strong>
                  <p>
                    이 폴더는 이미 공유폴더에 추가되어 있습니다.
                    공유폴더 탭의 내가 만든 목록에서 확인할 수 있습니다.
                  </p>
                </div>

                <div className="renameActions">
                  <button type="button" onClick={closeShareModal}>
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeShareModal();
                      setFolderType("shared");
                      setSharedFolderFilter("owned");
                      setSearchText("");
                      setIsSearchOpen(false);
                    }}
                  >
                    공유폴더 보기
                  </button>
                </div>
              </>
            ) : shareStep === "confirm" ? (
              <>
                <label>공유폴더 추가</label>

                <div className="shareConfirmBox">
                  <strong>{shareTarget.title}</strong>
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
                  <strong>{shareTarget.title}</strong>
                  <p>이 암호를 아는 사용자만 공유폴더에 입장할 수 있습니다.</p>
                </div>

                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => {
                    setSharePassword(e.target.value);
                    setShareError("");
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleShareCreate();
                    if (e.key === "Escape") closeShareModal();
                  }}
                  placeholder="공유폴더 암호를 입력하세요"
                  autoFocus
                />

                {shareError && (
                  <p className="sharedPasswordError">{shareError}</p>
                )}

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

      {renameTarget && (
        <div
          className="renameModalBg"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setRenameTarget(null);
            }
          }}
        >
          <div
            className="renameModal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <label>폴더 제목 수정</label>

            <input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSave();
                if (e.key === "Escape") setRenameTarget(null);
              }}
              autoFocus
            />

            <div className="renameActions">
              <button type="button" onClick={() => setRenameTarget(null)}>
                취소
              </button>
              <button type="button" onClick={handleRenameSave}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="deleteModalBg" onClick={() => setDeleteTarget(null)}>
          <div className="deleteModal" onClick={(e) => e.stopPropagation()}>
            <h2>폴더 삭제</h2>
            <p>
              <strong>{deleteTarget.title}</strong> 폴더를 삭제하시겠습니까?
            </p>

            <div className="deleteActions">
              <button type="button" onClick={() => setDeleteTarget(null)}>
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await removeNotebook(deleteTarget.id);
                    removeNotebookOwner(deleteTarget.id);
                    setDeleteTarget(null);
                  } catch {
                    // removeNotebook 내부에서 error 상태로 처리됨
                  }
                }}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
