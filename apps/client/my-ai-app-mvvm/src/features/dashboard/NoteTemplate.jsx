export function NoteTemplate({ note, viewMode, openMenuId, setOpenMenuId, onOpen, onDelete, onRename, onPin }) {
  const getCreatedDate = (note) => {
    const rawDate = note.createdAt || note.createdDate || note.date;
    if (!rawDate) return "-";
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ko-KR", {
      year: "numeric", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const isMenuOpen = openMenuId === note.id;

  const ContextMenu = () => (
    <div
      className={`notebookMenu ${viewMode === "list" ? "listMenu" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={() => onRename(note)}>제목 수정</button>
      <button type="button" onClick={() => onPin(note)}>{note.pinned ? "고정 해제" : "맨 위에 고정"}</button>
      <button className="noteMenuDanger" type="button" onClick={() => onDelete(note)}>삭제</button>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div className="noteListRow" onClick={() => onOpen(note)}>
        <div className="noteListTitle">
          <span className="noteListIcon">📄</span>
          <span>{note.title || "제목 없는 노트북"}</span>
        </div>
        <div className="noteListSource">
          소스 {note.sourceCount ?? note.sources?.length ?? note.files?.length ?? 0}개
        </div>
        <div className="noteListDate">{getCreatedDate(note)}</div>
        <div className="noteListPinned">
          {note.pinned ? (
            <img className="listPinIcon" src="/assets/listpin.png" alt="고정" />
          ) : (
            <span className="notPinnedText">-</span>
          )}
        </div>
        <div className="noteListMoreWrap">
          <button className="noteListMoreBtn" type="button" onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(isMenuOpen ? null : note.id);
          }}>⋮</button>
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
      <button className="notebookMoreBtn" type="button" onClick={(e) => {
        e.stopPropagation();
        setOpenMenuId(isMenuOpen ? null : note.id);
      }}>⋮</button>

      {isMenuOpen && <ContextMenu />}

      {note.pinned && (
        <div className="pinBadge"><img src="/assets/pin.png" alt="고정" /></div>
      )}

      <div className="folderIcon">
        <div className="folderTab"></div>
        <div className="folderBody">
          <span className="folderInnerTitle">{note.title}</span>
        </div>
      </div>
      <span>{note.title}</span>
    </div>
  );
}
