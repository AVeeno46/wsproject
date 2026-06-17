// 서버에서 AI가 생성한 문서를 보여주는 컴포넌트 (추후 구현)
export function AiDiffViewer({ content }) {
  if (!content) return null;

  return (
    <div className="docPreviewBox">
      <div className="docIcon">✨</div>
      <h2>AI 생성 문서</h2>
      <div style={{ whiteSpace: "pre-wrap", padding: "20px", textAlign: "left" }}>
        {content}
      </div>
    </div>
  );
}
