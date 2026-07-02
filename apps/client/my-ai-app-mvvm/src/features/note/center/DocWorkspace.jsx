// [View] 가운데 문서 작업 영역.
// 선택한 파일이 있으면 문서를 보여주고(DocViewer), 없으면 업로드 영역(FileDropzone)을 표시합니다.
// isOpen/onClose: 온디맨드 패널(캔버스)로 쓰기 위한 선택적 prop.
// 넘기지 않으면 기존처럼 항상 열린 상태로 동작합니다(하위 호환).
import { DocViewer } from "./DocViewer";
import { FileDropzone } from "./FileDropzone";

export function DocWorkspace({ activeSource, onDrop, isDragging, isOpen = true, onClose }) {
  if (!isOpen) return null;

  return (
    <section className="documentPanel">
      {onClose && (
        <button type="button" className="documentPanelCloseBtn" onClick={onClose} title="닫기">
          ✕
        </button>
      )}
      {activeSource ? (
        <DocViewer source={activeSource} />
      ) : (
        <FileDropzone onDrop={onDrop} isDragging={isDragging} />
      )}
    </section>
  );
}
