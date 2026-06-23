// [View] 가운데 문서 작업 영역.
// 선택한 파일이 있으면 문서를 보여주고(DocViewer), 없으면 업로드 영역(FileDropzone)을 표시합니다.
import { DocViewer } from "./DocViewer";
import { FileDropzone } from "./FileDropzone";

export function DocWorkspace({ activeSource, onDrop, isDragging }) {
  return (
    <section className="documentPanel">
      {activeSource ? (
        <DocViewer source={activeSource} />
      ) : (
        <FileDropzone onDrop={onDrop} isDragging={isDragging} />
      )}
    </section>
  );
}
