export function NoteCreateCard({ onClick }) {
  return (
    <button className="newNoteCard" type="button" onClick={onClick}>
      <div className="folderIcon">
        <div className="folderTab"></div>
        <div className="folderBody"><span>＋</span></div>
      </div>
      <p>새 노트북 생성</p>
      <span>제목을 입력하면 노트북이 생성됩니다</span>
    </button>
  );
}
