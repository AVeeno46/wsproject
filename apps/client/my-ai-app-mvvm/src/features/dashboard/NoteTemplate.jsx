export function NoteTemplate({
  note,
  viewMode,
  openMenuId,
  setOpenMenuId,
  onOpen,
  onDelete,
  onRename,
  onPin,
  onShare,
}) {
  const getCreatedDate = (note) => {
    const rawDate = note.createdAt || note.createdDate || note.date;

    if (!rawDate) return "-";

    const date = new Date(rawDate);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isMenuOpen = openMenuId === note.id;

  const sourceCount =
    note.sourceCount ?? note.sources?.length ?? note.files?.length ?? 0;

  const handleToggleMenu = (e) => {
    e.stopPropagation();
    setOpenMenuId(isMenuOpen ? null : note.id);
  };

  const handleRename = (e) => {
    e.stopPropagation();
    onRename?.(note);
  };

  const handleShare = (e) => {
    e.stopPropagation();
    onShare?.(note);
  };

  const handlePin = (e) => {
    e.stopPropagation();
    onPin?.(note);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(note);
  };

  const ContextMenu = () => (
    <div
      className={`notebookMenu ${viewMode === "list" ? "listMenu" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={handleRename}>
        제목 수정
      </button>

      <button type="button" onClick={handleShare}>
        공유하기
      </button>

      <button type="button" onClick={handlePin}>
        {note.pinned ? "고정 해제" : "맨 위에 고정"}
      </button>

      <button className="noteMenuDanger" type="button" onClick={handleDelete}>
        삭제
      </button>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div className="noteListRow" onClick={() => onOpen(note)}>
        <div className="noteListTitle">
          <span className="noteListIcon">📄</span>
          <span>{note.title || "제목 없는 노트북"}</span>

          {note.isShared && (
            <span className="folderSharedBadge listSharedBadge">공유 중</span>
          )}
        </div>

        <div className="noteListSource">소스 {sourceCount}개</div>

        <div className="noteListDate">{getCreatedDate(note)}</div>

        <div className="noteListPinned">
          {note.pinned ? (
            <img className="listPinIcon" src="/assets/listpin.png" alt="고정" />
          ) : (
            <span className="notPinnedText">-</span>
          )}
        </div>

        <div className="noteListMoreWrap">
          <button
            className="noteListMoreBtn"
            type="button"
            onClick={handleToggleMenu}
          >
            ⋮
          </button>

          {isMenuOpen && <ContextMenu />}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`newNoteCard notebookCard ${note.pinned ? "pinned" : ""}`}
      onClick={() => onOpen(note)}
    >
      <button
        className="notebookMoreBtn"
        type="button"
        onClick={handleToggleMenu}
      >
        ⋮
      </button>

      {isMenuOpen && <ContextMenu />}

      {note.pinned && (
        <div className="pinBadge">
          <img src="/assets/pin.png" alt="고정" />
        </div>
      )}

      <div className="folderIcon">
        <div className="folderTab"></div>

        <div className="folderBody">
          <span className="folderInnerTitle">{note.title}</span>

          {note.isShared && (
            <span className="folderSharedBadge">공유 중</span>
          )}
        </div>
      </div>

      <span>{note.title}</span>
    </div>
  );
}
