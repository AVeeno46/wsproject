// [Core] 다크/라이트 테마를 앱 전역에서 공유하는 Context.
// 선택한 테마는 localStorage에 저장해 새로고침 후에도 유지됩니다.
// 화면에서는 useTheme() 한 줄로 현재 테마와 변경 함수를 꺼내 씁니다.
import { useState } from 'react';
import { ThemeContext } from './themeContextValue';

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    const changeTheme = (value) => {
        setTheme(value);
        localStorage.setItem('theme', value);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: changeTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
