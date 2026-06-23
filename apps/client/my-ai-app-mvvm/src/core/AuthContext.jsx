import { createContext, useState } from 'react';

// 인증 상태와 관련된 정보를 관리하는 컨텍스트
export const AuthContext = createContext(null);

// 인증 상태를 제공하는 프로바이더 컴포넌트
export const AuthProvider = ({ children }) => {
    // 첫 렌더에서 동기적으로 localStorage를 읽어 로그인 상태를 복원합니다.
    // effect로 미루지 않으므로 첫 렌더 깜빡임과 cascading render 경고가 없습니다.
    const [auth, setAuth] = useState(() => {
        const savedToken = localStorage.getItem('accessToken');
        const savedUser = localStorage.getItem('userData');

        if (savedToken && savedUser) {
            try {
                return { token: savedToken, user: JSON.parse(savedUser) };
            } catch {
                // 저장된 사용자 정보가 손상되었으면 정리하고 로그아웃 상태로 시작합니다.
                localStorage.removeItem('accessToken');
                localStorage.removeItem('userData');
            }
        }

        return { token: null, user: null };
    });

    // 로그인 시 토큰과 사용자 정보를 저장하는 함수
    const login = (accessToken, userData) => {
        setAuth({ token: accessToken, user: userData });
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('userData', JSON.stringify(userData));
    };

    // 로그아웃 시 토큰과 사용자 정보를 제거하는 함수
    const logout = () => {
        setAuth({ token: null, user: null });
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userData');
    };

    return (
        <AuthContext.Provider value={{ token: auth.token, user: auth.user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
