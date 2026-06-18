import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDashboardViewModel } from "../../viewmodels/dashboardViewModel";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import { useTheme } from "../../core/ThemeContext";
import { NoteTemplate } from "./NoteTemplate";
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

  const [viewMode, setViewMode] = useState("grid");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortType, setSortType] = useState("latest");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [pinOverrides, setPinOverrides] = useState({});
  const [titleOverrides, setTitleOverrides] = useState({});

  const profileLabel = user?.name ? user.name[0] : "유";
  const profileName = user?.name || "사용자";

  const displayNotebooks = notebooks.map((n) => ({
    ...n,
    pinned: pinOverrides[n.id] ?? false,
    title: titleOverrides[n.id] ?? n.title,
  }));

  const filteredNotebooks = displayNotebooks.filter((note) => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return true;
    return (note.title || "").toLowerCase().includes(keyword);
  });

  const sortedNotebooks = [...filteredNotebooks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortType === "title") return (a.title || "").localeCompare(b.title || "", "ko");
    return new Date(b.createdAt || b.id) - new Date(a.createdAt || a.id);
  });

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setCreateTitle("");
  };

  const handleCreateSave = async () => {
    const title = createTitle.trim();
    if (!title) { alert("폴더 제목을 입력하세요."); return; }

    const newNotebook = await createNotebook(title);
    closeCreateModal();
    if (newNotebook?.id) {
      localStorage.setItem(`notebookTitle:${newNotebook.id}`, newNotebook.title || title);
      navigate(`/notebook/${newNotebook.id}`, { state: { title: newNotebook.title || title } });
    }
  };

  const handleRenameOpen = (note) => {
    setRenameTarget(note);
    setRenameTitle(note.title || "");
    setOpenMenuId(null);
  };

  const handleRenameSave = async () => {
    if (!renameTarget || !renameTitle.trim()) return;
    const nextTitle = renameTitle.trim();
    await updateNotebookTitle(renameTarget.id, nextTitle);
    setTitleOverrides((prev) => ({ ...prev, [renameTarget.id]: nextTitle }));
    setRenameTarget(null);
  };

  const handlePin = (note) => {
    setPinOverrides((prev) => ({ ...prev, [note.id]: !prev[note.id] }));
    setOpenMenuId(null);
  };

  return (
    <div
      className={`notebookPage ${theme === "dark" ? "dark" : ""}`}
      onClick={() => { setOpenMenuId(null); setSortMenuOpen(false); }}
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
          <button className="settingBtn" type="button" onClick={() => setIsSettingOpen(true)}>
            ⚙ 설정
          </button>
        </div>
      </header>

      <main className="notebookMain">
        <div className="titleRow">
          <h1>내 폴더</h1>

          <div className="notebookTools">
            <div className={`searchBox ${isSearchOpen ? "open" : ""}`}>
              {isSearchOpen && (
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="폴더 검색"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <button
                type="button"
                aria-label="폴더 검색"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSearchOpen((prev) => !prev);
                  if (isSearchOpen) setSearchText("");
                }}
              >
                <span className="searchIcon"></span>
              </button>
            </div>

            <div className="viewToggle">
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                onClick={(e) => { e.stopPropagation(); setViewMode("grid"); }}
              >
                <span className="gridIcon"><span></span><span></span><span></span><span></span></span>
              </button>
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={(e) => { e.stopPropagation(); setViewMode("list"); }}
              >
                <span className="listIcon"><span></span><span></span><span></span></span>
              </button>
            </div>

            <div className="sortWrap">
              <button
                className="sortBtn"
                type="button"
                onClick={(e) => { e.stopPropagation(); setSortMenuOpen((prev) => !prev); }}
              >
                {sortType === "latest" ? "최신 항목" : "제목"} ▾
              </button>
              {sortMenuOpen && (
                <div className="sortMenu" onClick={(e) => e.stopPropagation()}>
                  <button className={sortType === "latest" ? "active" : ""} onClick={() => { setSortType("latest"); setSortMenuOpen(false); }}>최신 항목</button>
                  <button className={sortType === "title" ? "active" : ""} onClick={() => { setSortType("title"); setSortMenuOpen(false); }}>제목</button>
                </div>
              )}
            </div>

            <button className="createNoteBtn" type="button" onClick={() => setIsCreateOpen(true)}>
              ＋ 새로 만들기
            </button>
          </div>
        </div>

        {loading && <p style={{ padding: "20px", color: "#718198" }}>불러오는 중...</p>}

        {viewMode === "grid" ? (
          <div className="noteGrid">
            <div className="newNoteCard" onClick={() => setIsCreateOpen(true)}>
              <div className="folderIcon">
                <div className="folderTab"></div>
                <div className="folderBody">
                  <span style={{ fontSize: "32px", color: "#4f7cff" }}>＋</span>
                </div>
              </div>
              <p>새 폴더</p>
              <span>폴더를 만들고 파일을 업로드하세요</span>
            </div>

            {sortedNotebooks.map((note) => (
              <NoteTemplate
                key={note.id}
                note={note}
                viewMode="grid"
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onOpen={(n) => navigate(`/notebook/${n.id}`, { state: { title: n.title } })}
                onDelete={(n) => { setDeleteTarget(n); setOpenMenuId(null); }}
                onRename={handleRenameOpen}
                onPin={handlePin}
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
                onOpen={(n) => navigate(`/notebook/${n.id}`, { state: { title: n.title } })}
                onDelete={(n) => { setDeleteTarget(n); setOpenMenuId(null); }}
                onRename={handleRenameOpen}
                onPin={handlePin}
              />
            ))}
          </div>
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
                <button type="button" onClick={() => setTheme("light")}><span className="sunMiniIcon"></span>밝은 모드</button>
                <button type="button" onClick={() => setTheme("dark")}><span className="moonMiniIcon"></span>어두운 모드</button>
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
                <button className="logoutSubBtn" type="button" onClick={requestLogout}>로그아웃</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div className="renameModalBg" onMouseDown={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}>
          <div className="renameModal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <label>새 폴더 제목</label>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateSave(); if (e.key === "Escape") closeCreateModal(); }}
              placeholder="폴더 제목을 입력하세요"
              autoFocus
            />
            <div className="renameActions">
              <button type="button" onClick={closeCreateModal}>취소</button>
              <button type="button" onClick={handleCreateSave}>생성</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="renameModalBg" onMouseDown={(e) => { if (e.target === e.currentTarget) setRenameTarget(null); }}>
          <div className="renameModal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <label>폴더 제목 수정</label>
            <input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameSave(); if (e.key === "Escape") setRenameTarget(null); }}
              autoFocus
            />
            <div className="renameActions">
              <button type="button" onClick={() => setRenameTarget(null)}>취소</button>
              <button type="button" onClick={handleRenameSave}>저장</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="deleteModalBg" onClick={() => setDeleteTarget(null)}>
          <div className="deleteModal" onClick={(e) => e.stopPropagation()}>
            <h2>폴더 삭제</h2>
            <p><strong>{deleteTarget.title}</strong> 폴더를 삭제하시겠습니까?</p>
            <div className="deleteActions">
              <button type="button" onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="button" onClick={() => { removeNotebook(deleteTarget.id); setDeleteTarget(null); }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
