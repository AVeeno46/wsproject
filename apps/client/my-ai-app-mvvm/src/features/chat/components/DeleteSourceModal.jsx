// [Chat] 소스(업로드 파일) 삭제 확인 모달.
// 실제 삭제 호출(deleteSource)은 ChatView.jsx가 소유합니다.
const getSourceName = (source) => source?.name || source?.file?.name || "선택한 파일";

export function DeleteSourceModal({ target, onCancel, onConfirm }) {
  if (!target) return null;

  return (
    <div className="sourceDeleteModalBg" onClick={onCancel}>
      <div className="sourceDeleteModal" onClick={(e) => e.stopPropagation()}>
        <h2>파일 삭제</h2>
        <p>
          <strong>{getSourceName(target)}</strong> 파일을 삭제하시겠습니까?
        </p>

        <div className="sourceDeleteActions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button type="button" onClick={onConfirm}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
