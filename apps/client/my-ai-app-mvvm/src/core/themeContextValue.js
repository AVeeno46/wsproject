import { createContext } from 'react';

// 테마 상태를 담는 Context 객체. Provider 컴포넌트(ThemeContext.jsx)와 별도
// 파일로 분리 — 한 파일이 컴포넌트만 export해야 Fast Refresh(HMR)가 그
// 파일만 갱신하고 전체 새로고침을 안 하게 된다.
export const ThemeContext = createContext(null);
