import { API_URL, IS_LOCAL } from '../constants/constants';

export const loginRequest = async (id, password) => {
    if (IS_LOCAL) {
        // 로컬 모드: 서버 없이 입력한 아이디로 임시 로그인
        return { token: `local-token-${id}` };
    }

    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
    });
    if (!response.ok) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    return response.json(); // { token }
};

export const logoutRequest = async (id) => {
    if (IS_LOCAL) return true;

    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
    });
    return response.ok;
};
