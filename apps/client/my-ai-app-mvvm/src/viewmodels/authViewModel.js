import { useContext, useState } from 'react';
import { AuthContext } from '../core/AuthContext';
import { loginRequest, logoutRequest } from '../models/authModel';
import { IS_LOCAL } from '../constants/constants';

export const useAuthViewModel = () => {
    const { login, logout, user, token } = useContext(AuthContext);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const requestLogin = async (id, password) => {
        setIsSubmitting(true);
        setError(null);
        try {
            const data = await loginRequest(id, password);
            // 서버 스펙: { token } (GUID)
            login(data.token, { id });
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    const requestLogout = async () => {
        if (!IS_LOCAL && user?.id) {
            await logoutRequest(user.id);
        }
        logout();
    };

    const bypassLogin = () => {
        login('admin-token', { id: 'admin', name: '관리자', role: 'admin' });
    };

    return {
        requestLogin,
        requestLogout,
        bypassLogin,
        isSubmitting,
        error,
        user,
        isAuthenticated: !!token,
    };
};
