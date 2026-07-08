import { lazy, Suspense } from "react";
import { HwpxEditor } from "./HwpxEditor";

// react-pdf(PDF.js)는 압축해도 300~400KB대로 무거운 편이라, PDF를 실제로 열
// 때만 코드를 받아오도록 지연 로드한다 — PDF를 한 번도 안 여는 사용자의
// 초기 로딩 크기에 영향을 주지 않기 위함.
const PdfViewer = lazy(() =>
  import("./PdfViewer").then((m) => ({ default: m.PdfViewer }))
);

export function DocViewer({ source }) {
  const fileName = source.name || "파일";
  const ext = fileName.split(".").pop().toLowerCase();

  // 한글 .hwpx → 텍스트 편집기로 분기
  if (ext === "hwpx") {
    return <HwpxEditor source={source} />;
  }

  // .pdf → 열람 전용 뷰어로 분기
  if (ext === "pdf") {
    return (
      <Suspense
        fallback={
          <div className="docPreviewBox">
            <div className="docIcon">📄</div>
            <h2>{fileName}</h2>
            <p>뷰어를 불러오는 중입니다...</p>
          </div>
        }
      >
        <PdfViewer source={source} />
      </Suspense>
    );
  }

  return (
    <div className="docPreviewBox">
      <div className="docIcon">📄</div>
      <h2>{fileName}</h2>
      <p>문서 미리보기는 준비 중입니다.</p>
    </div>
  );
}
