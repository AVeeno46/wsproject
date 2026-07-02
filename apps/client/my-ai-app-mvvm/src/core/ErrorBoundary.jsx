import { Component } from "react";

// 렌더링 중 발생한 예외를 잡아 앱 전체가 백지가 되는 것을 막는 전역 안전망.
// React에서 ErrorBoundary는 클래스 컴포넌트로만 만들 수 있습니다.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("렌더링 중 오류가 발생했습니다:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    // 손상된 화면 상태를 버리고 메인 화면으로 복귀합니다.
    window.location.href = "/chat";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "24px",
            textAlign: "center",
            fontFamily: "sans-serif",
            color: "#1f2937",
          }}
        >
          <h2 style={{ margin: 0 }}>문제가 발생했습니다</h2>
          <p style={{ margin: 0, color: "#6b7280" }}>
            페이지를 표시하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              marginTop: "8px",
              padding: "10px 18px",
              border: "none",
              borderRadius: "8px",
              background: "#2563eb",
              color: "#fff",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            대시보드로 돌아가기
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
