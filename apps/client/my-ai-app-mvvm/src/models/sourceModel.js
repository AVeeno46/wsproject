import { API_URL, IS_LOCAL, MAX_FILE_SIZE_MB } from '../constants/constants';
import { getAuthHeader, handleUnauthorized } from './modelUtils';

const lsKey = (notebookId) => `local_sources_${notebookId}`;
const getLocalSources = (notebookId) => JSON.parse(localStorage.getItem(lsKey(notebookId)) || '[]');
const saveLocalSources = (notebookId, list) => localStorage.setItem(lsKey(notebookId), JSON.stringify(list));

// 파일 목록 조회
export const fetchSourcesRequest = async (notebookId) => {
    if (IS_LOCAL) return getLocalSources(notebookId);

    const response = await fetch(`${API_URL}/work-space/file/get-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('소스 목록을 불러오지 못했습니다.');
    return response.json(); // [{ file_name, file_id }]
};

// 파일 업로드 (HWP, PDF 등 바이너리 → FormData)
export const uploadSourceRequest = async (notebookId, fileObject) => {
    if (fileObject.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`);
    }

    if (IS_LOCAL) {
        const sources = getLocalSources(notebookId);
        const newSource = {
            file_id: Date.now(),
            file_name: fileObject.name,
            size: fileObject.size,
            createdAt: new Date().toISOString(),
        };
        saveLocalSources(notebookId, [...sources, newSource]);
        return newSource;
    }

    const formData = new FormData();
    formData.append('file', fileObject);
    formData.append('dashboard_id', notebookId);

    const response = await fetch(`${API_URL}/work-space/file/upload`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('파일 업로드에 실패했습니다.');
    return response.json(); // { file_name, file_id }
};

// 파일 열기 (서버 → 클라이언트, 형식 미정)
export const openSourceRequest = async (notebookId, fileId) => {
    if (IS_LOCAL) return null;

    const response = await fetch(`${API_URL}/work-space/file/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, file_id: fileId }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('파일을 열 수 없습니다.');
    return response.json(); // file_s_to_c (형식 미정)
};

// 파일 검토 (텍스트 반환)
export const reviewSourceRequest = async (notebookId, fileId) => {
    if (IS_LOCAL) return '로컬 모드에서는 문서 텍스트를 불러올 수 없습니다.';

    const response = await fetch(`${API_URL}/work-space/file/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, file_id: fileId }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('문서 텍스트를 불러오지 못했습니다.');
    return response.json(); // { text }
};

// 문서 검색 (질문 기반)
export const selectDocumentRequest = async (notebookId, question) => {
    if (IS_LOCAL) return null;

    const response = await fetch(`${API_URL}/work-space/file/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, question }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('문서 검색에 실패했습니다.');
    return response.json(); // { file_text, file_name, file_id }
};

// 파일 삭제
export const deleteSourceRequest = async (notebookId, fileId) => {
    if (IS_LOCAL) {
        const sources = getLocalSources(notebookId);
        saveLocalSources(notebookId, sources.filter((s) => s.file_id !== fileId));
        return true;
    }

    const response = await fetch(`${API_URL}/work-space/file/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, file_id: fileId }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};
