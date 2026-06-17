import { API_URL, IS_LOCAL } from '../constants/constants';
import { getAuthHeader, handleUnauthorized } from './modelUtils';

const LS_KEY = 'local_notebooks';

const getLocalNotebooks = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
const saveLocalNotebooks = (list) => localStorage.setItem(LS_KEY, JSON.stringify(list));

export const fetchNotebooksRequest = async () => {
    if (IS_LOCAL) return getLocalNotebooks();

    const response = await fetch(`${API_URL}/dashboard/individual/get-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 목록을 불러오지 못했습니다.');
    return response.json(); // [{ dashboard_name, dashboard_id }]
};

export const createNotebookRequest = async (title) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        const newNotebook = { dashboard_id: Date.now(), dashboard_name: title, createdAt: new Date().toISOString() };
        saveLocalNotebooks([...notebooks, newNotebook]);
        return newNotebook;
    }

    const response = await fetch(`${API_URL}/dashboard/individual/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_name: title }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 생성에 실패했습니다.');
    return response.json(); // { dashboard_id }
};

export const deleteNotebookRequest = async (notebookId) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        saveLocalNotebooks(notebooks.filter((n) => n.dashboard_id !== notebookId));
        return true;
    }

    const response = await fetch(`${API_URL}/dashboard/individual/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

// 서버 엔드포인트 미정 — 현재 로컬 처리만
export const updateNotebookTitleRequest = async (notebookId, title) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        saveLocalNotebooks(
            notebooks.map((n) =>
                n.dashboard_id === notebookId ? { ...n, dashboard_name: title } : n
            )
        );
        return { id: notebookId, title };
    }
    // TODO: 서버 엔드포인트 추가 후 연결
    return { id: notebookId, title };
};
