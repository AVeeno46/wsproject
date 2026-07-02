// [Chat] 대화 공유 모달 — confirm(확인) → password(암호 설정) 2단계.
// 상태머신(step, password, error)과 핸들러는 ChatView.jsx가 소유합니다.
export function ShareConversationModal({
  isOpen,
  step,
  title,
  password,
  onPasswordChange,
  error,
  onNext,
  onBack,
  onCreate,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="conversationModalBg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="conversationModal"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {step === "confirm" ? (
          <>
            <label>대화 공유</label>

            <div className="shareConfirmBox">
              <strong>{title}</strong>
              <p>이 대화를 공유하시겠습니까?</p>
            </div>

            <div className="conversationModalActions">
              <button type="button" onClick={onClose}>
                취소
              </button>
              <button type="button" onClick={onNext}>
                다음
              </button>
            </div>
          </>
        ) : (
          <>
            <label>공유 암호 설정</label>

            <div className="shareConfirmBox">
              <strong>{title}</strong>
              <p>이 암호를 아는 사용자만 공유된 대화에 입장할 수 있습니다.</p>
            </div>

            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") onClose();
              }}
              placeholder="공유 암호를 입력하세요"
              autoFocus
            />

            {error && <p className="sharedPasswordError">{error}</p>}

            <div className="conversationModalActions">
              <button type="button" onClick={onBack}>
                이전
              </button>
              <button type="button" onClick={onCreate}>
                공유
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
