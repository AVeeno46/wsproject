import React, { createContext, useState, useEffect } from 'react';

// 인증 상태와 관련된 정보를 관리하는 컨텍스트
export const AuthContext = createContext(null);

// 인증 상태를 제공하는 프로바이더 컴포넌트
export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 컴포넌트가 마운트될 때 로컬 스토리지에서 토큰과 사용자 정보를 불러오는 효과
    useEffect(() => {
        const savedToken = localStorage.getItem('accessToken');
        const savedUser = localStorage.getItem('userData');

        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setIsLoading(false);
    }, []);

    // 로그인 시 토큰과 사용자 정보를 저장하는 함수
    const login = (accessToken, userData) => {
        setToken(accessToken);
        setUser(userData);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('userData', JSON.stringify(userData));
    };

    // 로그아웃 시 토큰과 사용자 정보를 제거하는 함수
    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userData');
    };

    // 인증 상태가 로딩 중일 때는 아무것도 렌더링하지 않음
    if (isLoading) return null;

    return (
        <AuthContext.Provider value={{ token, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};