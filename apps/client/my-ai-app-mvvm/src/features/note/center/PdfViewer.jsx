// [View] .pdf 문서 뷰어. HwpxEditor.jsx와 동일한 방식으로 source(파일)를 불러온다:
// 업로드 직후엔 source.file(File 객체)을 바로 쓰고, 서버 모드에선 source.id로 내려받는다.
// 편집은 지원하지 않음(열람 전용) — AI 질의응답 연동은 향후 범위.
import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { downloadSourceRequest } from "../../../models/sourceModel";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

export function PdfViewer({ source }) {
  const [fileData, setFileData] = useState(null); // ArrayBuffer
  const [error, setError] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    setFileData(null);
    setError(null);
    setNumPages(null);
    setPageNumber(1);

    if (!source) return;

    if (source.file instanceof File) {
      source.file.arrayBuffer().then(setFileData).catch(() => setError("파일을 읽지 못했습니다."));
      return;
    }

    if (source.id) {
      downloadSourceRequest(source.id)
        .then((res) => res && setFileData(res.buffer))
        .catch(() => setError("파일을 불러오지 못했습니다."));
    }
  }, [source?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileName = source?.name || "문서.pdf";
  const needsManualPick = source && !(source.file instanceof File) && !source.id;

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

  return (
    <div className="hwpxEditor">
      <div className="hwpxToolbar">
        <div className="hwpxToolbarLeft">
          <strong className="hwpxFileName" title={fileName}>{fileName}</strong>
        </div>
        {numPages && (
          <div className="pdfPageNav">
            <button
              type="button"
              className="hwpxGhostBtn"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
            >
              ‹ 이전
            </button>
            <span className="pdfPageInfo">{pageNumber} / {numPages}</span>
            <button
              type="button"
              className="hwpxGhostBtn"
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
            >
              다음 ›
            </button>
          </div>
        )}
      </div>

      <div className="hwpxDocScroll pdfDocScroll">
        <Document
          file={fileData}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          onLoadError={() => setError("PDF를 여는 중 오류가 발생했습니다.")}
          loading={<p className="pdfLoadingText">불러오는 중...</p>}
        >
          <Page pageNumber={pageNumber} className="pdfPage" />
        </Document>
      </div>
    </div>
  );
}
