import pdfIcon from "../../../assets/pdf.png";
import hwpIcon from "../../../assets/hwp.png";
import wordIcon from "../../../assets/word.png";
import excelIcon from "../../../assets/excel.png";
import pptIcon from "../../../assets/ppt.png";
import fileIcon from "../../../assets/file.png";

export function SourceItem({ source, isActive, isSidebarOpen, onClick }) {
const getFileIcon = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();

  if (ext === "pdf") return pdfIcon;
  if (ext === "hwp" || ext === "hwpx") return hwpIcon;
  if (ext === "doc" || ext === "docx") return wordIcon;
  if (ext === "xls" || ext === "xlsx") return excelIcon;
  if (ext === "ppt" || ext === "pptx") return pptIcon;

  return fileIcon;
};

  const fileName = source.name || "파일";
  // 서버가 status를 안 내려주는 문서(하위호환)는 sourceModel의 toClient에서
  // 이미 "ready"로 채워져 있으므로, 여기서는 있는 그대로만 판단하면 된다.
  const isProcessing = source.status === "processing";
  const isFailed = source.status === "failed";
  const title = isProcessing
    ? `${fileName} (임베딩 처리 중...)`
    : isFailed
      ? `${fileName} (임베딩 실패)`
      : fileName;

  return (
    <button
      className={`uploadedFileItem ${isActive ? "active" : ""}`}
  onClick={onClick}
  title={title}
  data-source-item="true"
    >
      <img className="sourceFileIcon" src={getFileIcon(fileName)} alt="" />
      {isProcessing && <span className="sourceStatusBadge processing" aria-label="임베딩 처리 중" />}
      {isFailed && <span className="sourceStatusBadge failed" aria-label="임베딩 실패">!</span>}

      {isSidebarOpen && (
        <span className="fileTextBox">
          <span className="fileName">{fileName}</span>
          <span className="fileMeta">{source.createdAt?.slice(0, 10) || "-"}</span>
        </span>
      )}
    </button>
  );
}