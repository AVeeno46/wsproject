import { HwpxEditor } from "./HwpxEditor";

export function DocViewer({ source }) {
  const fileName = source.name || "파일";
  const ext = fileName.split(".").pop().toLowerCase();

  // 한글 .hwpx → 텍스트 편집기로 분기
  if (ext === "hwpx") {
    return <HwpxEditor source={source} />;
  }

  return (
    <div className="docPreviewBox">
      <div className="docIcon">📄</div>
      <h2>{fileName}</h2>
      <p>문서 미리보기는 준비 중입니다.</p>
    </div>
  );
}
