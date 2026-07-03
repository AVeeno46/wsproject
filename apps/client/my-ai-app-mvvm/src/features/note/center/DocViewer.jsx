import { HwpxEditor } from "./HwpxEditor";
import { PdfViewer } from "./PdfViewer";

export function DocViewer({ source }) {
  const fileName = source.name || "파일";
  const ext = fileName.split(".").pop().toLowerCase();

  // 한글 .hwpx → 텍스트 편집기로 분기
  if (ext === "hwpx") {
    return <HwpxEditor source={source} />;
  }

  // .pdf → 열람 전용 뷰어로 분기
  if (ext === "pdf") {
    return <PdfViewer source={source} />;
  }

  return (
    <div className="docPreviewBox">
      <div className="docIcon">📄</div>
      <h2>{fileName}</h2>
      <p>문서 미리보기는 준비 중입니다.</p>
    </div>
  );
}
