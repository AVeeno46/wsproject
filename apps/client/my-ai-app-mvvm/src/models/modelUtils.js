// [Model 공용 유틸] 모든 model이 함께 쓰는 HTTP 헬퍼.
// 인증 헤더 생성, 401(인증 만료) 처리, 네트워크 에러 정규화를 담당합니다.

// 저장된 JWT 토큰을 Authorization 헤더 형태로 반환 (없으면 빈 객체)
export const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const handleUnauthorized = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userData');
    window.location.href = '/login';
    // 호출부가 undefined를 정상 응답으로 오해하지 않도록 에러로 전파합니다.
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
};

// fetch의 네트워크 단계 실패(서버 다운/오프라인)는 'Failed to fetch' 같은
// 영어 메시지로 reject되므로, 한국어 메시지로 정규화해서 던집니다.
export const apiFetch = async (url, options) => {
    try {
        return await fetch(url, options);
    } catch {
        throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
    }
};
