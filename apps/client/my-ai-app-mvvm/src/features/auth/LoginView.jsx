import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthViewModel } from "../../viewmodels/authViewModel";
import "../../styles/LoginPage.css";

const ADMIN_ID = "admin";
const ADMIN_PW = "alskdj13@";

export function LoginView() {
  const navigate = useNavigate();
  const { requestLogin, bypassLogin, isSubmitting, error } = useAuthViewModel();

  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [keepLogin, setKeepLogin] = useState(false);
  const [loginType, setLoginType] = useState("normal");

  useEffect(() => {
    const savedId = localStorage.getItem("savedLoginId");
    const savedPw = localStorage.getItem("savedLoginPw");
    if (savedId && savedPw) {
      setLoginId(savedId);
      setLoginPw(savedPw);
      setKeepLogin(true);
    }
  }, []);

  const handleLogin = async () => {
    if (loginType === "simple") {
      if (!loginId.trim()) {
        alert("아이디를 입력해주세요.");
        return;
      }
    } else {
      if (!loginId.trim() || !loginPw.trim()) {
        alert("아이디와 비밀번호를 입력해주세요.");
        return;
      }
    }

    // 관리자 계정 로컬 처리
    if (loginId === ADMIN_ID && loginPw === ADMIN_PW) {
      if (keepLogin) {
        localStorage.setItem("savedLoginId", loginId);
        localStorage.setItem("savedLoginPw", loginPw);
      } else {
        localStorage.removeItem("savedLoginId");
        localStorage.removeItem("savedLoginPw");
      }
      bypassLogin();
      navigate("/dashboard");
      return;
    }

    // 일반 계정 서버 로그인
    const success = await requestLogin(loginId, loginPw);
    if (success) {
      if (keepLogin) {
        localStorage.setItem("savedLoginId", loginId);
        localStorage.setItem("savedLoginPw", loginPw);
      } else {
        localStorage.removeItem("savedLoginId");
        localStorage.removeItem("savedLoginPw");
      }
      navigate("/dashboard");
    }
  };

  const handleEnterLogin = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="loginPage">
      <section className="loginShell">
        <div className="loginIntro">
          <div className="loginLogoGroup">
            <img className="loginLogoMark" src="/assets/logo.png" alt="우송대학교 심볼" />
            <img className="loginLogoText" src="/assets/logo2.png" alt="우송대학교 로고 텍스트" />
          </div>

          <div className="loginHero">
            <div className="loginTitle">
              <span className="sparkle">✦</span>
              <h1>Woo-Song 챗봇</h1>
            </div>
            <p className="loginDesc">
              문서에 대해 궁금한 내용을 질문해보세요.
              <br />
              AI가 문서를 기반으로 답변해드립니다.
            </p>
          </div>

          <div className="loginCircle"></div>
          <div className="loginMascotShadow"></div>
          <img className="loginMascot" src="/assets/3.png" alt="마스코트" />

          <div className="loginFeatureList">
            <div className="loginFeature">
              <div className="featureIcon blue">⚙️</div>
              <div>
                <strong>문서 자동화</strong>
                <span>반복적인 문서 업무를 자동으로 처리해드려요</span>
              </div>
            </div>
            <div className="loginFeature">
              <div className="featureIcon green">🔍</div>
              <div>
                <strong>문서 검색</strong>
                <span>원하는 정보를 빠르게 찾아드려요</span>
              </div>
            </div>
            <div className="loginFeature">
              <div className="featureIcon purple">💬</div>
              <div>
                <strong>AI 기반 답변</strong>
                <span>문서를 기반으로 정확히 답변해드려요</span>
              </div>
            </div>
          </div>
        </div>

        <div className="loginRight">
          <div className="loginCard">
            <div className="loginTabs">
              <button
                className={loginType === "normal" ? "active" : ""}
                onClick={() => setLoginType("normal")}
              >
                교번 로그인
              </button>
              <button
                className={loginType === "simple" ? "active" : ""}
                onClick={() => setLoginType("simple")}
              >
                간편 로그인
              </button>
            </div>

            {loginType === "normal" ? (
              <>
                <h2>로그인하여 시작하세요!</h2>
                <p>교직원 계정으로 로그인해주세요.</p>

                <div className="loginInput">
                  <span className="inputIcon userIcon"></span>
                  <input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    onKeyDown={handleEnterLogin}
                    placeholder="교번 또는 아이디를 입력하세요"
                  />
                </div>

                <div className="loginInput">
                  <span className="inputIcon lockIcon"></span>
                  <input
                    type="password"
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                    onKeyDown={handleEnterLogin}
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="new-password"
                  />
                </div>

                <label className="keepLogin">
                  <input
                    type="checkbox"
                    checked={keepLogin}
                    onChange={(e) => setKeepLogin(e.target.checked)}
                  />
                  <span>로그인 상태 유지</span>
                </label>

                {error && <p style={{ color: "red", fontSize: "14px" }}>{error}</p>}

                <button className="loginBtn" onClick={handleLogin} disabled={isSubmitting}>
                  {isSubmitting ? "로그인 중..." : "로그인"}
                </button>

                <div className="loginLinks">
                  <button>아이디 찾기</button>
                  <span>|</span>
                  <button>비밀번호 찾기</button>
                </div>
              </>
            ) : (
              <>
                <h2>간편 로그인</h2>
                <p>학생은 학번, 교직원은 교번을 입력 후 로그인하세요.</p>

                <div className="loginInput">
                  <span className="inputIcon">👤</span>
                  <input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    onKeyDown={handleEnterLogin}
                    placeholder="아이디를 입력하세요"
                  />
                </div>

                <label className="keepLogin">
                  <input
                    type="checkbox"
                    checked={keepLogin}
                    onChange={(e) => setKeepLogin(e.target.checked)}
                  />
                  <span>아이디 저장</span>
                </label>

                {error && <p style={{ color: "red", fontSize: "14px" }}>{error}</p>}

                <button className="loginBtn" onClick={handleLogin} disabled={isSubmitting}>
                  {isSubmitting ? "로그인 중..." : "로그인"}
                </button>

                <div className="loginLinks">
                  <button>아이디 찾기</button>
                  <span>|</span>
                  <button>비밀번호 재설정</button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
