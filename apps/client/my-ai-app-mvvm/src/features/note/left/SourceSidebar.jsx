// [View] 왼쪽 소스(파일) 사이드바.
// 업로드한 파일 목록을 보여주고, 파일 추가(업로드)·삭제 동작을 처리합니다.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SourceItem } from "./SourceItem";

export function SourceSidebar({
  sources,
  isUploading,
  uploadError,
  clearUploadError,
  uploadFile,
  activeSource,
  setActiveSource,
  onDeleteSource,
  onSourceUploaded,
}) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [fileViewMode, setFileViewMode] = useState("grid");
  const [isExternalFileDragging, setIsExternalFileDragging] = useState(false);
  const [sourceContextMenu, setSourceContextMenu] = useState(null);

  useEffect(() => {
    const closeContextMenu = () => setSourceContextMenu(null);

    const closeContextMenuByEsc = (e) => {
      if (e.key === "Escape") setSourceContextMenu(null);
    };

    const resetDragGuide = () => {
      setIsExternalFileDragging(false);
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("keydown", closeContextMenuByEsc);
    window.addEventListener("drop", resetDragGuide);
    window.addEventListener("dragend", resetDragGuide);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("keydown", closeContextMenuByEsc);
      window.removeEventListener("drop", resetDragGuide);
      window.removeEventListener("dragend", resetDragGuide);
    };
  }, []);

  const isExternalFileDrag = (e) => {
    const types = Array.from(e.dataTransfer?.types || []);
    return types.includes("Files");
  };

  const isDraggingSourceItem = (e) => {
    return Boolean(e.target.closest("[data-source-item='true']"));
  };

  const handleUploadClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 같은 파일을 다시 선택해도 onChange가 다시 발생하도록 먼저 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const newSource = await uploadFile(file);
        if (newSource) onSourceUploaded?.(newSource);
      } catch (error) {
        console.error("파일 업로드 실패:", file.name, error);
      }
    }
  };

const handleFileChange = async (e) => {
  const inputEl = e.currentTarget;
  const files = Array.from(inputEl.files || []);

  if (files.length === 0) return;

  for (const file of files) {
    const newSource = await uploadFile(file);
    if (newSource) onSourceUploaded?.(newSource);
  }

  inputEl.value = "";
};

  const handleDrop = async (e) => {
    if (isDraggingSourceItem(e)) {
      e.preventDefault();
      setIsExternalFileDragging(false);
      return;
    }

    if (!isExternalFileDrag(e)) {
      setIsExternalFileDragging(false);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsExternalFileDragging(false);

    const files = Array.from(e.dataTransfer.files || []);
    await uploadFiles(files);
  };

  const handleSourceContextMenu = (e, source) => {
    e.preventDefault();
    e.stopPropagation();

    setSourceContextMenu({
      source,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDeleteSource = () => {
    if (!sourceContextMenu?.source) return;

    onDeleteSource?.(sourceContextMenu.source);
    setSourceContextMenu(null);
  };

  return (
    <aside className={`sidebar ${isSidebarOpen ? "" : "closed"}`}>
      <div className="logoArea">
        {isSidebarOpen && (
          <img
            className="schoolLogo"
            src="/assets/logo.png"
            alt="우송대학교 로고"
            onClick={() => navigate("/chat")}
            draggable={false}
            style={{ cursor: "pointer" }}
          />
        )}

        <button
          className="toggleBtn"
          type="button"
          onClick={() => setIsSidebarOpen((prev) => !prev)}
        >
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
            <button
              type="button"
              className={fileViewMode === "grid" ? "active" : ""}
              onClick={() => setFileViewMode("grid")}
            >
              ▦
            </button>

            <button
              type="button"
              className={fileViewMode === "list" ? "active" : ""}
              onClick={() => setFileViewMode("list")}
            >
              ☰
            </button>
          </div>

          <div className="fileFolderHeader">
            <span>문서 폴더 목록</span>
          </div>
        </>
      )}

      <div
        className={`uploadedFileArea ${fileViewMode}`}
        onDragEnter={(e) => {
          if (isDraggingSourceItem(e)) {
            setIsExternalFileDragging(false);
            return;
          }

          if (isExternalFileDrag(e)) {
            e.preventDefault();
            setIsExternalFileDragging(true);
          }
        }}
        onDragOver={(e) => {
          if (isDraggingSourceItem(e)) {
            setIsExternalFileDragging(false);
            return;
          }

          if (isExternalFileDrag(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsExternalFileDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        {sources.length === 0 ? (
          isSidebarOpen && (
            <p className="emptyFileText">업로드한 파일이 여기에 표시됩니다.</p>
          )
        ) : (
          sources.map((source) => (
            <div
              key={source.id}
              className="sourceItemContextWrap"
              data-source-item="true"
              draggable={false}
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsExternalFileDragging(false);
              }}
              onContextMenu={(e) => handleSourceContextMenu(e, source)}
            >
              <SourceItem
                source={source}
                isActive={activeSource?.id === source.id}
                isSidebarOpen={isSidebarOpen}
                onClick={() => {
                  setActiveSource(source);
                  setSourceContextMenu(null);
                }}
              />
            </div>
          ))
        )}
      </div>

      {sourceContextMenu && (
        <div
          className="sourceContextMenu"
          style={{
            left: sourceContextMenu.x,
            top: sourceContextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" onClick={handleDeleteSource}>
            삭제
          </button>
        </div>
      )}

      <div className="bottomMenu">
        {uploadError && isSidebarOpen && (
          <div className="uploadErrorBanner" role="alert">
            <span>{uploadError}</span>
            <button
              type="button"
              className="uploadErrorClose"
              onClick={() => clearUploadError?.()}
              aria-label="에러 메시지 닫기"
            >
              ×
            </button>
          </div>
        )}

        <button
          className="menuBtn"
          type="button"
          onClick={handleUploadClick}
        >
          <span>📁</span>
          {isSidebarOpen && (
            <span>{isUploading ? "업로드 중..." : "파일 업로드"}</span>
          )}
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
