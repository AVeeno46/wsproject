export function DocViewer({ source }) {
  const fileName = source.file_name || source.name || "파일";
  const ext = fileName.split(".").pop().toLowerCase();
  const fileUrl = source.file_url || source.fileUrl;

  return (
    <div className="docPreviewBox">
      {fileUrl ? (
        <iframe
          className="docViewer"
          src={fileUrl}
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
