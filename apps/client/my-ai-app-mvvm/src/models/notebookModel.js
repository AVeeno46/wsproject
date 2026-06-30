import { SERVER_URL, IS_LOCAL } from '../constants/constants';
// [Model] 개인폴더 데이터 계층.
// 폴더 목록 조회/생성/삭제/제목수정(CRUD)을 담당합니다.
// IS_LOCAL이면 서버 대신 localStorage에 저장합니다.
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

const LS_KEY = 'local_notebooks'; // 로컬 모드에서 노트북 목록을 저장하는 키
const BASE = `${SERVER_URL}/dashboard/individual`;

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

// 서버 응답 필드(dashboard_id, dashboard_name)를 클라이언트 필드(id, title)로 변환
const toClient = (folder) => ({ id: String(folder.dashboard_id), title: folder.dashboard_name });

export const fetchNotebooksRequest = async () => {
    // [로컬]
    if (IS_LOCAL) return getLocalNotebooks();
    // [서버]
    const response = await apiFetch(`${BASE}/get-all`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('폴더 목록을 불러오지 못했습니다.');
    const data = await response.json();
    return data.map(toClient);
};

export const createNotebookRequest = async (title) => {
    // [로컬]
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        const newNotebook = { id: Date.now().toString(), title, createdAt: new Date().toISOString() };
        saveLocalNotebooks([...notebooks, newNotebook]);
        return newNotebook;
    }
    // [서버]
    const response = await apiFetch(`${BASE}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_name: title }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (response.status === 409) throw new Error('같은 이름의 폴더가 이미 있습니다.');
    if (!response.ok) throw new Error('폴더 생성에 실패했습니다.');
    return toClient(await response.json());
};

export const deleteNotebookRequest = async (notebookId) => {
    // [로컬]
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        saveLocalNotebooks(notebooks.filter((n) => n.id !== notebookId));
        return true;
    }
    // [서버]
    const response = await apiFetch(`${BASE}/delete/${notebookId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

export const fetchNotebookByIdRequest = async (notebookId) => {
    // [로컬]
    if (IS_LOCAL) {
        const notebooks = getLocalNotebooks();
        return notebooks.find((n) => String(n.id) === String(notebookId)) || null;
    }
    // [서버]
    const allResponse = await apiFetch(`${BASE}/get-all`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (allResponse.status === 401) return handleUnauthorized();
    if (!allResponse.ok) throw new Error('폴더 정보를 불러오지 못했습니다.');
    const data = await allResponse.json();
    const found = data.find((f) => String(f.dashboard_id) === String(notebookId));
    return found ? toClient(found) : null;
};

export const updateNotebookTitleRequest = async (notebookId, title) => {
    // [로컬]
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
    // [서버]
    const response = await apiFetch(`${BASE}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: Number(notebookId), dashboard_name: title }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (response.status === 404) throw new Error('폴더를 찾을 수 없거나 수정 권한이 없습니다.');
    if (response.status === 409) throw new Error('같은 이름의 폴더가 이미 있습니다.');
    if (response.status === 422) throw new Error('폴더 이름 또는 ID가 올바르지 않습니다.');
    if (!response.ok) throw new Error('폴더 제목 수정에 실패했습니다.');
    return { id: String(notebookId), title };
};
