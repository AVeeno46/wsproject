import { API_URL, IS_LOCAL } from '../constants/constants';
// [Model] 노트북(폴더) 데이터 계층.
// 노트북 목록 조회/생성/삭제/제목수정(CRUD)을 담당합니다.
// IS_LOCAL이면 서버 대신 localStorage에 저장합니다.
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

const LS_KEY = 'local_notebooks'; // 로컬 모드에서 노트북 목록을 저장하는 키

const getLocalNotebooks = () => {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch {
        return [];
    }
};

const saveLocalNotebooks = (list) => {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
        // localStorage 사용 불가(용량 초과/시크릿 모드) 시 새로고침 후 초기화됩니다.
    }
};

export const fetchNotebooksRequest = async () => {
    if (IS_LOCAL) return getLocalNotebooks();

    const response = await apiFetch(`${API_URL}/notebooks`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 목록을 불러오지 못했습니다.');
    return response.json();
};

export const createNotebookRequest = async (title) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        const newNotebook = { id: Date.now().toString(), title, createdAt: new Date().toISOString() };
        saveLocalNotebooks([...notebooks, newNotebook]);
        return newNotebook;
    }

    const response = await apiFetch(`${API_URL}/notebooks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 생성에 실패했습니다.');
    return response.json();
};

export const deleteNotebookRequest = async (notebookId) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        saveLocalNotebooks(notebooks.filter((n) => n.id !== notebookId));
        return true;
    }

    const response = await apiFetch(`${API_URL}/notebooks/${notebookId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

export const fetchNotebookByIdRequest = async (notebookId) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        return notebooks.find((n) => String(n.id) === String(notebookId)) || null;
    }

    const response = await apiFetch(`${API_URL}/notebooks/${notebookId}`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });

    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 정보를 불러오지 못했습니다.');
    return response.json();
};

export const updateNotebookTitleRequest = async (notebookId, title) => {
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();

        const updatedNotebooks = notebooks.map((n) =>
            String(n.id) === String(notebookId)
                ? { ...n, title, updatedAt: new Date().toISOString() }
                : n
        );

        saveLocalNotebooks(updatedNotebooks);

        return updatedNotebooks.find((n) => String(n.id) === String(notebookId));
    }

    const response = await apiFetch(`${API_URL}/notebooks/${notebookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ title }),
    });

    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('노트북 제목 수정에 실패했습니다.');
    return response.json();
};

