import { API_URL } from '../constants/constants';

export const loginRequest = async (id, password) => {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
    });
    if (!response.ok) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    return response.json(); // { token }
};

export const logoutRequest = async (id) => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
    });
    return response.ok;
};
