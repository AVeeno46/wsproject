// [Chat] 대화(기존 개인폴더/노트북) 삭제 확인 모달.
// 실제 삭제 호출(removeNotebook 등)은 ChatView.jsx가 소유합니다.
export function DeleteConversationModal({ target, onCancel, onConfirm }) {
  if (!target) return null;

  return (
    <div className="conversationDeleteModalBg" onClick={onCancel}>
      <div className="conversationDeleteModal" onClick={(e) => e.stopPropagation()}>
        <h2>대화 삭제</h2>
        <p>
          <strong>{target.title}</strong> 대화를 삭제하시겠습니까?
        </p>

        <div className="conversationDeleteActions">
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
