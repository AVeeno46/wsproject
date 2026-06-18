export function DocViewer({ source }) {
  const fileName = source.name || source.filename || "파일";
  const ext = fileName.split(".").pop().toLowerCase();

  return (
    <div className="docPreviewBox">
      {ext === "pdf" && source.fileUrl ? (
        <iframe
          className="docViewer"
          src={source.fileUrl}
          title={fileName}
        />
      ) : (
        <>
          <div className="docIcon">📄</div>
          <h2>{fileName}</h2>
          <p>문서 미리보기는 준비 중입니다.</p>
        </>
      )}
    </div>
  );
}
