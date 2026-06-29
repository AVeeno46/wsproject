// [Model] 인증(로그인) 데이터 계층.
// 1) /token/creation-refresh-token 으로 로그인 → access token + refresh-token 쿠키 수령
// 2) /member/my-name 으로 유저 이름 조회
// 3) /token/creation-access-token 으로 토큰 갱신 (refresh-token 쿠키 자동 전송)
import { SERVER_URL } from "../constants/constants";
import { apiFetch } from "./modelUtils";

// 서버 미연결 상태에서 로그인 테스트용으로 쓰는 가짜 계정 목록
const TEST_USERS = [
  {
    email: "admin",
    password: "alskdj13@",
    accessToken: "mock-admin-token",
    user: { id: "admin", name: "관리자", role: "관리자" },
  },
  {
    email: "qwer",
    password: "1234",
    accessToken: "mock-user-token",
    user: { id: "qwer", name: "최서연", role: "학생" },
  },
];

export const loginRequest = async (email, password) => {
  // [로컬] TEST_USERS 계정이면 가짜 토큰 반환
  const testUser = TEST_USERS.find(
    (u) => u.email === email && u.password === password
  );
  if (testUser) {
    return { accessToken: testUser.accessToken, user: testUser.user };
  }

  // [서버] 1단계: 로그인 → access token 수령 + refresh-token 쿠키 세팅
  const loginResponse = await apiFetch(`${SERVER_URL}/token/creation-refresh-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // refresh-token HttpOnly 쿠키 저장에 필요
    body: JSON.stringify({ login_id: email, login_password: password }),
  });

  if (!loginResponse.ok) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  const accessToken = await loginResponse.text();

  const nameResponse = await apiFetch(`${SERVER_URL}/member/my-name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!nameResponse.ok) throw new Error("유저 정보를 불러오지 못했습니다.");
  const { name } = await nameResponse.json();

  return { accessToken, user: { name } };
};

// 만료된 access token + refresh-token 쿠키로 새 access token 발급
// 자동 재발급은 modelUtils.js의 apiFetch()가 처리하므로 직접 호출할 일은 거의 없음
export const refreshTokenRequest = async (expiredToken, retryCount = 0) => {
  const response = await apiFetch(`${SERVER_URL}/token/creation-access-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${expiredToken}` },
    credentials: "include", // refresh-token 쿠키 자동 전송
  });

  // 409: JWT 생성 동시 시도 — 잠깐 기다렸다가 재시도 (최대 3회)
  if (response.status === 409) {
    if (retryCount >= 3) throw new Error("토큰 재발급 실패 (동시 요청 충돌)");
    await new Promise((res) => setTimeout(res, 300 * (retryCount + 1)));
    return refreshTokenRequest(expiredToken, retryCount + 1);
  }

  if (!response.ok) {
    throw new Error("토큰이 만료되었습니다. 다시 로그인해주세요.");
  }

  return response.text(); // 새 access token 문자열
};