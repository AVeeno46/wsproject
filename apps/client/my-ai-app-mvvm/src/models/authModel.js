// [Model] 인증(로그인) 데이터 계층.
// 1) /token/creation-refresh-token 으로 로그인 → access token + refresh-token 쿠키 수령
// 2) /member/me 로 유저 정보 조회 → { accessToken, user } 조합 반환
// 3) /token/creation-access-token 으로 토큰 갱신 (refresh-token 쿠키 자동 전송)
import { SERVER_URL } from "../constants/constants";
import { apiFetch } from "./modelUtils";

// ⚠️ 서버 유저 정보 엔드포인트 — 실제 경로 확인 후 수정
const USER_PROFILE_URL = `${SERVER_URL}/member/me`;

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
  const testUser = TEST_USERS.find(
    (u) => u.email === email && u.password === password
  );
  if (testUser) {
    return { accessToken: testUser.accessToken, user: testUser.user };
  }

  // 1단계: 로그인 → access token 수령 + refresh-token 쿠키 세팅
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

  // 2단계: 발급된 토큰으로 유저 정보 조회
  const profileResponse = await apiFetch(USER_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileResponse.ok) {
    throw new Error("유저 정보를 불러오지 못했습니다.");
  }

  const user = await profileResponse.json();

  return { accessToken, user };
};

// 만료된 access token + refresh-token 쿠키로 새 access token 발급
export const refreshTokenRequest = async (expiredToken) => {
  const response = await apiFetch(`${SERVER_URL}/token/creation-access-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${expiredToken}` },
    credentials: "include", // refresh-token 쿠키 자동 전송
  });

  if (!response.ok) {
    throw new Error("토큰이 만료되었습니다. 다시 로그인해주세요.");
  }

  return response.text(); // 새 access token 문자열
};