// [View] .pdf 문서 뷰어. HwpxEditor.jsx와 동일한 방식으로 source(파일)를 불러온다:
// 업로드 직후엔 source.file(File 객체)을 바로 쓰고, 서버 모드에선 source.id로 내려받는다.
// 편집은 지원하지 않음(열람 전용) — AI 질의응답 연동은 향후 범위.
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { downloadSourceRequest, downloadSourceByNameRequest } from "../../../models/sourceModel";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.25;

export function PdfViewer({ source }) {
  const [fileData, setFileData] = useState(null); // ArrayBuffer
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  const scrollRef = useRef(null);
  const requestIdRef = useRef(0);

  // 문서 뷰어 폭 측정 — 가용 폭에 맞춰 <Page width>를 계산한다.
  // fileData가 없을 때는 scrollRef가 달린 div 자체가 렌더되지 않으므로,
  // 마운트 시 1회([])가 아니라 fileData가 로드된 뒤에도 다시 시도해야 한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fileData]);

  // source가 바뀌면 뷰어 리셋 후 자동 로드 — 외부 자원(파일 바이트)을 불러오는
  // effect라 정당한 자리(React "Connecting to an external system" 패턴).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFileData(null);
    setError(null);
    setNumPages(null);
    setPageNumber(1);
    setPageInput("1");
    setScale(1);

    // 소스를 빠르게 연달아 전환하면 늦게 도착한 이전 요청이 최신 문서를
    // 덮어쓸 수 있어, 요청마다 토큰을 부여해 최신 요청 결과만 반영한다.
    const requestId = ++requestIdRef.current;

    if (!source) return;

    if (source.file instanceof File) {
      source.file
        .arrayBuffer()
        .then((buf) => {
          if (requestIdRef.current !== requestId) return;
          setFileData(buf);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          setError("파일을 읽지 못했습니다.");
        });
      return;
    }

    // 채팅 답변 출처(source_ref) 클릭 열람 — file_id가 아니라 file_name으로 조회
    // (docs/file-upload-api-contract.md §2.5, 가정 계약)
    const downloadPromise = source.byName
      ? downloadSourceByNameRequest(source.name)
      : source.id
      ? downloadSourceRequest(source.id)
      : null;

    if (downloadPromise) {
      downloadPromise
        .then((res) => {
          if (requestIdRef.current !== requestId) return;
          if (res) {
            setFileData(res.buffer);
            return;
          }
          // 로컬(IS_LOCAL) 모드는 파일 바이트를 저장하지 않아 다운로드가 null을
          // 반환한다 — "불러오는 중..."에 영원히 머무는 대신 이유를 안내한다.
          setError(
            "지금은 서버 미연결(로컬) 모드라 저장된 파일을 다시 열 수 없습니다. 서버 연결 후 열람할 수 있습니다."
          );
        })
        .catch((e) => {
          if (requestIdRef.current !== requestId) return;
          setError(e.message || "파일을 불러오지 못했습니다.");
        });
    }
  }, [source?.id, source?.byName, source?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileName = source?.name || "문서.pdf";
  const needsManualPick = source && !(source.file instanceof File) && !source.id && !source.byName;

  const goToPage = (next) => {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(numPages, next));
    setPageNumber(clamped);
    setPageInput(String(clamped));
  };

  const handlePageInputSubmit = (e) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) {
      setPageInput(String(pageNumber));
      return;
    }
    goToPage(parsed);
  };

  const handleZoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const handleZoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const handleZoomReset = () => setScale(1);

  const handleDownload = () => {
    if (!fileData) return;
    const blob = new Blob([fileData], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!fileData) {
    return (
      <div className="docPreviewBox">
        <div className="docIcon">📄</div>
        <h2>{fileName}</h2>
        {error ? (
          <p className="hwpxError">{error}</p>
        ) : needsManualPick ? (
          <p>새로고침으로 파일 정보가 초기화되었습니다.<br />파일을 다시 업로드해 주세요.</p>
        ) : (
          <p>파일을 불러오는 중입니다...</p>
        )}
      </div>
    );
  }

  const pageWidth = containerWidth > 0 ? Math.max(containerWidth - 32, 100) * scale : undefined;

  return (
    <div className="hwpxEditor">
      <div className="hwpxToolbar">
        <div className="hwpxToolbarLeft">
          <strong className="hwpxFileName" title={fileName}>{fileName}</strong>
        </div>
        <div className="hwpxToolbarRight">
          <button type="button" className="hwpxGhostBtn" onClick={handleZoomOut} disabled={scale <= MIN_SCALE} title="축소">
            −
          </button>
          <button type="button" className="hwpxGhostBtn" onClick={handleZoomReset} title="100%로">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="hwpxGhostBtn" onClick={handleZoomIn} disabled={scale >= MAX_SCALE} title="확대">
            +
          </button>
          <button type="button" className="hwpxGhostBtn" onClick={handleDownload} title="다운로드">
            ⬇ 다운로드
          </button>
        </div>
      </div>

      {numPages && (
        <div className="pdfPageNav">
          <button
            type="button"
            className="hwpxGhostBtn"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
          >
            ‹ 이전
          </button>
          <form className="pdfPageJump" onSubmit={handlePageInputSubmit}>
            <input
              type="text"
              inputMode="numeric"
              className="pdfPageInput"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageInputSubmit}
              aria-label="페이지 번호"
            />
            <span className="pdfPageInfo"> / {numPages}</span>
          </form>
          <button
            type="button"
            className="hwpxGhostBtn"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
          >
            다음 ›
          </button>
        </div>
      )}

      {/* scale > 1이면 확대된 페이지가 컨테이너보다 넓어지는데, flex 중앙 정렬(justify-content:center)
          상태로 넘치면 왼쪽 부분이 스크롤로 되돌아갈 수 없게 잘리는 알려진 문제가 있어
          확대 시엔 좌측 정렬로 바꿔 전체 내용을 스크롤로 볼 수 있게 한다. */}
      <div
        className="hwpxDocScroll pdfDocScroll"
        ref={scrollRef}
        style={{ justifyContent: scale > 1 ? "flex-start" : "center" }}
      >
        <Document
          file={fileData}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setError("PDF를 여는 중 오류가 발생했습니다.")}
          loading={<p className="pdfLoadingText">불러오는 중...</p>}
        >
          <Page pageNumber={pageNumber} width={pageWidth} className="pdfPage" />
        </Document>
      </div>
    </div>
  );
}
