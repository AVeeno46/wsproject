import { useContext, useState } from 'react';
import { AuthContext } from '../core/AuthContext';
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
