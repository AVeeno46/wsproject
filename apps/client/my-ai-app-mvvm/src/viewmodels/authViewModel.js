// [ViewModel] 인증 화면의 상태와 로직을 담는 hook.
// 로그인/로그아웃 동작과 진행상태(isSubmitting)·에러를 관리하고,
// 실제 로그인 정보는 AuthContext(전역 상태)에 저장합니다.
import { useContext, useState } from 'react';
import { AuthContext } from '../core/authContextValue';
import { loginRequest } from '../models/authModel';

export const useAuthViewModel = () => {
    const { login, logout, user, token } = useContext(AuthContext);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const requestLogin = async (email, password) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const data = await loginRequest(email, password);
            login(data.accessToken, data.user);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const bypassLogin = () => {
        login('admin-token', { name: '관리자', role: 'admin' });
    };

    return {
        requestLogin,
        requestLogout: logout,
        bypassLogin,
        isSubmitting,
        error,
        user,
        isAuthenticated: !!token,
    };
};
