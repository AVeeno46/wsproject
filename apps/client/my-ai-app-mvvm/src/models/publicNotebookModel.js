import { API_URL, IS_LOCAL } from '../constants/constants';
import { getAuthHeader, handleUnauthorized } from './modelUtils';

const LS_KEY = 'local_public_notebooks';
const getLocalPublic = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
const saveLocalPublic = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list));

// 참여 중인 공유 노트북 목록
export const fetchPublicNotebooksRequest = async () => {
    if (IS_LOCAL) return getLocalPublic();

    const response = await fetch(`${API_URL}/dashboard/public/get-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유 노트북 목록을 불러오지 못했습니다.');
    return response.json(); // [{ dashboard_id, dashboard_name }]
};

// 공유 노트북 생성 (비밀번호 설정)
export const createPublicNotebookRequest = async (title, password) => {
    if (IS_LOCAL) {
        const list = getLocalPublic();
        const newItem = { dashboard_id: Date.now(), dashboard_name: title, createdAt: new Date().toISOString() };
        saveLocalPublic([...list, newItem]);
        return newItem;
    }

    const response = await fetch(`${API_URL}/dashboard/public/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_name: title, password }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유 노트북 생성에 실패했습니다.');
    return response.json(); // { dashboard_id }
};

// 공유 노트북 참여 (비밀번호 입력)
export const enterPublicNotebookRequest = async (notebookId, password) => {
    if (IS_LOCAL) return true;

    const response = await fetch(`${API_URL}/dashboard/public/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, password }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('비밀번호가 올바르지 않습니다.');
    return response.ok;
};

// 공유 노트북 나가기
export const leavePublicNotebookRequest = async (notebookId) => {
    if (IS_LOCAL) {
        saveLocalPublic(getLocalPublic().filter((n) => n.dashboard_id !== notebookId));
        return true;
    }

    const response = await fetch(`${API_URL}/dashboard/public/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

// 공유 노트북 삭제 (방장 전용)
export const deletePublicNotebookRequest = async (notebookId) => {
    if (IS_LOCAL) {
        saveLocalPublic(getLocalPublic().filter((n) => n.dashboard_id !== notebookId));
        return true;
    }

    const response = await fetch(`${API_URL}/dashboard/public/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

// 공유 노트북 검색
export const selectPublicNotebookRequest = async (keyword) => {
    if (IS_LOCAL) {
        return getLocalPublic().filter((n) =>
            (n.dashboard_name || '').toLowerCase().includes(keyword.toLowerCase())
        );
    }

    const response = await fetch(`${API_URL}/dashboard/public/selete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ keyword }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('검색에 실패했습니다.');
    return response.json(); // [{ dashboard_id, dashboard_name }]
};

// 공유 노트북 열기 (워크스페이스 진입)
export const openPublicNotebookRequest = async (notebookId) => {
    if (IS_LOCAL) return null;

    const response = await fetch(`${API_URL}/dashboard/public/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북을 열 수 없습니다.');
    return response.json();
};
