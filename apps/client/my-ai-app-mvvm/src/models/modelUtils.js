import { SERVER_URL } from "../constants/constants";

export const getAuthHeader = () => {
  const token = localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const handleUnauthorized = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("userData");
  window.location.href = "/login";
  throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
};

const refreshTokenRequest = async (expiredToken) => {
  const response = await fetch(`${SERVER_URL}/token/creation-access-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${expiredToken}` },
    credentials: "include",
  });

  if (!response.ok) throw new Error("토큰 재발급 실패");

  return response.text();
};

let isRefreshing = false;   // 재발급 중복 방지 플래그

export const apiFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);

    if (response.status === 401 && !options._retry) {
      if (isRefreshing) return handleUnauthorized();    // 이미 재발급 중이면 바로 로그아웃 처리

      isRefreshing = true;

      try {
        const expiredToken = localStorage.getItem("accessToken");
        const newToken = await refreshTokenRequest(expiredToken);

        localStorage.setItem("accessToken", newToken);

        // 새 토큰으로 헤더 교체 후 원래 요청 재시도
        const retryOptions = {
          ...options,
          _retry: true,   // 무한루프 방지
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        };

        return await fetch(url, retryOptions);
      } catch {
        handleUnauthorized();
      } finally {
        isRefreshing = false;
      }
    }

    return response;
  } catch (e) {
    if (e.message === "인증이 만료되었습니다. 다시 로그인해주세요.") throw e;
    throw new Error("서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
  }
};
