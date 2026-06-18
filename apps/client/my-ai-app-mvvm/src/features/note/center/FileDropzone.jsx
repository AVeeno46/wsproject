export function FileDropzone({ onDrop, isDragging }) {
  return (
    <div
      className={`docPreviewBox ${isDragging ? "dragActive" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();

        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) onDrop(files);
      }}
    >
      <div className="docIcon">📁</div>
      <h2>문서를 선택해주세요</h2>
      <p>왼쪽 파일 목록에서 문서를 선택하세요.</p>
    </div>
  );
}
