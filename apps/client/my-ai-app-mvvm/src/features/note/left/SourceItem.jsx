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

  const fileName = source.file_name || source.name || "파일";

  return (
    <button
      className={`uploadedFileItem ${isActive ? "active" : ""}`}
      onClick={onClick}
      title={fileName}
      data-source-item="true"
    >
      <img className="sourceFileIcon" src={getFileIcon(fileName)} alt="" />
      {isSidebarOpen && (
        <span className="fileTextBox">
          <span className="fileName">{fileName}</span>
          <span className="fileMeta">{source.createdAt?.slice(0, 10) || "-"}</span>
        </span>
      )}
    </button>
  );
}
