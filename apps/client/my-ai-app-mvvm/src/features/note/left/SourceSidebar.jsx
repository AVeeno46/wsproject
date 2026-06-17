import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SourceItem } from "./SourceItem";

export function SourceSidebar({ sources, isUploading, uploadFile, activeSource, setActiveSource }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [fileViewMode, setFileViewMode] = useState("grid");
  const [isExternalFileDragging, setIsExternalFileDragging] = useState(false);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    for (const file of files) await uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsExternalFileDragging(false);
    Array.from(e.dataTransfer.files || []).forEach((file) => uploadFile(file));
  };

  return (
    <aside className={`sidebar ${isSidebarOpen ? "" : "closed"}`}>
      <div className="logoArea">
        {isSidebarOpen && (
          <img
            className="schoolLogo"
            src="/assets/logo.png"
            alt="우송대학교 로고"
            onClick={() => navigate("/dashboard")}
            style={{ cursor: "pointer" }}
          />
        )}
        <button className="toggleBtn" onClick={() => setIsSidebarOpen((prev) => !prev)}>
          {isSidebarOpen ? "‹" : "›"}
        </button>
      </div>

      {isExternalFileDragging && isSidebarOpen && (
        <div className="sidebarDragGuide">
          <strong>파일 업로드</strong>
          <span>문서 영역에 놓으면 파일이 업로드됩니다</span>
        </div>
      )}

      {isSidebarOpen && (
        <>
          <div className="viewToggle">
            <button className={fileViewMode === "grid" ? "active" : ""} onClick={() => setFileViewMode("grid")}>▦</button>
            <button className={fileViewMode === "list" ? "active" : ""} onClick={() => setFileViewMode("list")}>☰</button>
          </div>
          <div className="fileFolderHeader">
            <span>문서 폴더 목록</span>
          </div>
        </>
      )}

      <div
        className={`uploadedFileArea ${fileViewMode}`}
        onDragOver={(e) => { e.preventDefault(); setIsExternalFileDragging(true); }}
        onDrop={handleDrop}
      >
        {sources.length === 0 ? (
          isSidebarOpen && <p className="emptyFileText">업로드한 파일이 여기에 표시됩니다.</p>
        ) : (
          sources.map((source) => (
            <SourceItem
              key={source.file_id}
              source={source}
              isActive={activeSource?.file_id === source.file_id}
              isSidebarOpen={isSidebarOpen}
              onClick={() => setActiveSource(source)}
            />
          ))
        )}
      </div>

      <div className="bottomMenu">
        <button className="menuBtn" onClick={handleUploadClick} disabled={isUploading}>
          <span>📁</span>
          {isSidebarOpen && <span>{isUploading ? "업로드 중..." : "파일 업로드"}</span>}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.hwp,.hwpx,.txt,.ppt,.pptx,.xls,.xlsx"
        />
      </div>
    </aside>
  );
}
