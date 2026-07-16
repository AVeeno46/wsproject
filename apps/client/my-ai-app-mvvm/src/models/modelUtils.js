import { SERVER_URL } from "../constants/constants";

export const getAuthHeader = () => {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// 브라우저 전용 데이터(대화 고정, 유사어 사전 등)의 localStorage 키를 계정별로
// 분리하기 위한 현재 로그인 사용자 id. 같은 브라우저에서 다른 계정으로 로그인해도
// 서로의 로컬 데이터가 섞이지 않게 한다. (AuthContext가 로그인 시 userData를
// localStorage에 저장하므로 여기서 동기적으로 읽을 수 있다.)
export const getCurrentUserId = () => {
  try {
    const saved = localStorage.getItem("userData");
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed?.id ? String(parsed.id) : "guest";
  } catch {
    return "guest";
  }
};

export const handleUnauthorized = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("userData");
  window.location.href = "/login";
  throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
};

const refreshTokenRequest = async (expiredToken, retryCount = 0) => {
  const response = await fetch(`${SERVER_URL}/token/creation-access-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${expiredToken}` },
    credentials: "include",
  });

  // 409: JWT 생성 동시 시도 — 잠깐 기다렸다가 재시도 (최대 3회)
  if (response.status === 409) {
    if (retryCount >= 3) throw new Error("토큰 재발급 실패 (동시 요청 충돌)");
    await new Promise((res) => setTimeout(res, 300 * (retryCount + 1)));
    return refreshTokenRequest(expiredToken, retryCount + 1);
  }

  if (!response.ok) throw new Error("토큰 재발급 실패");

  return response.text();
};

let refreshPromise = null;

export const apiFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);

    if (response.status === 401 && !options._retry) {
      if (!refreshPromise) {
        refreshPromise = refreshTokenRequest(localStorage.getItem("accessToken"))
          .then((newToken) => {
            localStorage.setItem("accessToken", newToken);
            return newToken;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        const newToken = await refreshPromise;
        const retryOptions = {
          ...options,
          _retry: true,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        };
        return await fetch(url, retryOptions);
      } catch {
        handleUnauthorized();
      }
    }

    return response;
  } catch (e) {
    if (e.message === "인증이 만료되었습니다. 다시 로그인해주세요.") throw e;
    throw new Error("서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.", { cause: e });
  }
};
