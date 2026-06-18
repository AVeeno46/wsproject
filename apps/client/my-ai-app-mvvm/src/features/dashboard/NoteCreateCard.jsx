export function NoteCreateCard({ onClick }) {
  return (
    <button className="newNoteCard" type="button" onClick={onClick}>
      <div className="folderIcon">
        <div className="folderTab"></div>
        <div className="folderBody"><span>＋</span></div>
      </div>
      <p>새 폴더 생성</p>
      <span>제목을 입력하면 폴더가 생성됩니다</span>
    </button>
  );
}
