import { API_URL } from "../constants/constants";

const TEST_USERS = [
  {
    email: "admin",
    password: "alskdj13@",
    accessToken: "mock-admin-token",
    user: {
      id: "admin",
      name: "관리자",
      role: "관리자",
    },
  },
  {
    email: "qwer",
    password: "1234",
    accessToken: "mock-user-token",
    user: {
      id: "qwer",
      name: "최서연",
      role: "학생",
    },
  },
];

// id or email?
export const loginRequest = async (email, password) => {
  const testUser = TEST_USERS.find(
    (user) => user.email === email && user.password === password
  );

  if (testUser) {
    return {
      accessToken: testUser.accessToken,
      user: testUser.user,
    };
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  }

  return response.json(); // { accessToken, user }
};