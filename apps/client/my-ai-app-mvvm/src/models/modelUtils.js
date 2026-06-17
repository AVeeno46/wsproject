export const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const handleUnauthorized = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userData');
    window.location.href = '/login';
};
