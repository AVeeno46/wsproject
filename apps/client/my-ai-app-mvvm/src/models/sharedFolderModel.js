// 공유폴더 데이터 계층.
// IS_LOCAL이면 localStorage, 서버 모드면 /dashboard/public/* API를 호출합니다.
import { SERVER_URL, IS_LOCAL } from '../constants/constants';
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

const BASE = `${SERVER_URL}/dashboard/public`;

// 서버 응답 필드(folder_id, folder_name 등)를 클라이언트 필드로 변환
const toClient = (folder) => ({
    id: String(folder.folder_id),
    title: folder.folder_name,
    owner: folder.owner || '',
    ownerId: String(folder.owner_id || ''),
    isOwner: folder.is_owner ?? false,
    members: folder.members || 1,
    code: folder.code || '',
    createdAt: folder.created_at || '',
    department: folder.department || '우송대학교',
    hasPassword: folder.has_password ?? true,
    description: folder.description || '',
});

const ownedKey = (userId) => `ownedSharedFolders:${userId}`;
const joinedKey = (userId) => `joinedSharedFolders:${userId}`;
const ALL_KEY = 'allSharedFolders';

const readLocalArraySafe = (key) => {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch {
        return [];
    }
};

// id 기준 중복 제거 (뒤에 온 항목이 우선)
export const dedupeFolders = (folders) => {
    const map = new Map();
    folders.forEach((folder) => {
        if (!folder?.id) return;
        map.set(folder.id, folder);
    });
    return Array.from(map.values());
};

// ---- 목록 로드 ----

export const loadOwnedSharedFolders = (userId) => {
    const currentOwned = readLocalArraySafe(ownedKey(userId));
    const globalFolders = readLocalArraySafe(ALL_KEY);

    const ownedFromGlobal = globalFolders.filter((folder) => {
        if (folder.ownerId) return folder.ownerId === userId;
        // 예전에 만든 공유폴더는 ownerId가 없으므로 관리자 공유폴더로 취급합니다.
        return userId === 'admin' && (folder.owner === '관리자' || !folder.owner);
    });

    // 예전 구조로 저장된 공유폴더는 관리자 계정에서만 보여줍니다.
    const legacyOwned = userId === 'admin' ? readLocalArraySafe('ownedSharedFolders') : [];

    return dedupeFolders([...currentOwned, ...ownedFromGlobal, ...legacyOwned]);
};

export const loadJoinedSharedFolders = (userId) => readLocalArraySafe(joinedKey(userId));

export const loadAllSharedFolders = () => {
    const globalFolders = readLocalArraySafe(ALL_KEY);
    const legacyOwned = readLocalArraySafe('ownedSharedFolders');
    const legacyJoined = readLocalArraySafe('joinedSharedFolders');
    return dedupeFolders([...globalFolders, ...legacyOwned, ...legacyJoined]);
};

// ---- 목록 저장 ----

export const persistOwnedSharedFolders = (userId, list) => {
    try {
        localStorage.setItem(ownedKey(userId), JSON.stringify(list));
    } catch {
        // localStorage를 못 쓰는 환경이면 새로고침 후에는 초기화됩니다.
    }
};

export const persistJoinedSharedFolders = (userId, list) => {
    try {
        localStorage.setItem(joinedKey(userId), JSON.stringify(list));
    } catch {
        // localStorage를 못 쓰는 환경이면 새로고침 후에는 초기화됩니다.
    }
};

export const persistAllSharedFolders = (list) => {
    try {
        localStorage.setItem(ALL_KEY, JSON.stringify(list));
    } catch {
        // localStorage를 못 쓰는 환경이면 새로고침 후에는 초기화됩니다.
    }
};

// ---- 제목 동기화 ----

const syncSharedFolderTitle = (folder) => {
    if (!folder) return folder;

    const sourceTitle = folder.sourceNotebookId
        ? localStorage.getItem(`notebookTitle:${folder.sourceNotebookId}`)
        : null;

    const sharedTitle = folder.id
        ? localStorage.getItem(`notebookTitle:${folder.id}`)
        : null;

    return { ...folder, title: sourceTitle || sharedTitle || folder.title };
};

export const syncSharedFolderTitles = (folders) =>
    dedupeFolders(folders.map(syncSharedFolderTitle));

// ---- 검색 ----

export const getSearchableSharedFolders = (userId, extraFolders = []) => {
    const merged = [
        ...readLocalArraySafe('allSharedFolders'),
        ...readLocalArraySafe('ownedSharedFolders'),
        ...readLocalArraySafe('joinedSharedFolders'),
        ...readLocalArraySafe('ownedSharedFolders:admin'),
        ...readLocalArraySafe('ownedSharedFolders:qwer'),
        ...readLocalArraySafe(ownedKey(userId)),
        ...readLocalArraySafe(joinedKey(userId)),
        ...extraFolders,
    ];
    return dedupeFolders(merged);
};

// ---- 삭제 (모든 저장소에서 제거) ----

export const removeSharedFolderFromStorage = (targetFolder) => {
    const removedSourceNotebookIds = new Set();

    try {
        const targetId = typeof targetFolder === 'object' ? targetFolder.id : targetFolder;
        const targetSourceNotebookId =
            typeof targetFolder === 'object'
                ? targetFolder.sourceNotebookId || targetFolder.originalNotebookId
                : null;
        const targetCode = typeof targetFolder === 'object' ? targetFolder.code : null;
        const targetTitle = typeof targetFolder === 'object' ? targetFolder.title : null;

        if (targetSourceNotebookId) {
            removedSourceNotebookIds.add(String(targetSourceNotebookId));
        }

        const shouldRemoveFolder = (folder) => {
            if (!folder) return false;

            const sameId = targetId && String(folder.id) === String(targetId);
            const sameSourceNotebook =
                targetSourceNotebookId &&
                (String(folder.sourceNotebookId) === String(targetSourceNotebookId) ||
                    String(folder.originalNotebookId) === String(targetSourceNotebookId));
            const sameCode = targetCode && String(folder.code) === String(targetCode);
            // 예전 데이터는 sourceNotebookId/code가 없을 수 있어서 제목까지 보조 비교
            const sameTitle = targetTitle && String(folder.title) === String(targetTitle);

            const shouldRemove = sameId || sameSourceNotebook || sameCode || sameTitle;

            if (shouldRemove) {
                if (folder.sourceNotebookId) {
                    removedSourceNotebookIds.add(String(folder.sourceNotebookId));
                }
                if (folder.originalNotebookId) {
                    removedSourceNotebookIds.add(String(folder.originalNotebookId));
                }
            }

            return shouldRemove;
        };

        const sharedKeys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (
                key === 'allSharedFolders' ||
                key === 'ownedSharedFolders' ||
                key === 'joinedSharedFolders' ||
                key?.startsWith('ownedSharedFolders:') ||
                key?.startsWith('joinedSharedFolders:')
            ) {
                sharedKeys.push(key);
            }
        }

        sharedKeys.forEach((key) => {
            const folders = readLocalArraySafe(key);
            const nextFolders = folders.filter((folder) => !shouldRemoveFolder(folder));
            localStorage.setItem(key, JSON.stringify(nextFolders));
        });

        if (targetId) localStorage.removeItem(`notebookTitle:${targetId}`);

        removedSourceNotebookIds.forEach((sourceNotebookId) => {
            localStorage.removeItem(`notebookShared:${sourceNotebookId}`);
        });
    } catch (error) {
        console.error('공유폴더 저장소 삭제 실패:', error);
    }

    return Array.from(removedSourceNotebookIds);
};

// ---- 노트북 공유 상태 / 제목 / 소유자 helpers ----

export const setSharedFolderTitle = (id, title) => {
    localStorage.setItem(`notebookTitle:${id}`, title);
};

export const markNotebookShared = (notebookId) => {
    localStorage.setItem(`notebookShared:${notebookId}`, 'true');
};

export const getNotebookTitle = (id) => localStorage.getItem(`notebookTitle:${id}`);

export const getNotebookOwnerId = (notebookId) => {
    try {
        // 예전에 만든 폴더는 owner 정보가 없으므로 admin 폴더로 취급합니다.
        return localStorage.getItem(`notebookOwner:${notebookId}`) || 'admin';
    } catch {
        return 'admin';
    }
};

export const setNotebookOwner = (notebookId, userId) => {
    localStorage.setItem(`notebookOwner:${notebookId}`, userId);
};

export const removeNotebookOwner = (notebookId) => {
    localStorage.removeItem(`notebookOwner:${notebookId}`);
};

export const getSharedNotebookIds = () => {
    const ids = new Set();
    try {
        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key?.startsWith('notebookShared:')) continue;
            const notebookId = key.replace('notebookShared:', '');
            if (localStorage.getItem(key) === 'true') ids.add(String(notebookId));
        }
    } catch {
        // localStorage 데이터가 이상하면 무시
    }
    return ids;
};

// ---- 도메인 helpers ----

export const makeSharedCode = () =>
    `SF-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export const getTodayText = () =>
    new Date()
        .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
        .replace(/\.\s?/g, '.')
        .replace(/\.$/, '');

// ---- 서버 API 요청 함수 ----

// GET /dashboard/public/get-all
// is_owner: true → 내가 만든 폴더, false → 참여한 폴더
export const fetchAllSharedFoldersRequest = async (currentUserId) => {
    // [로컬] localStorage에서 owned/joined/all 분리 반환
    if (IS_LOCAL) {
        return {
            owned: loadOwnedSharedFolders(currentUserId),
            joined: loadJoinedSharedFolders(currentUserId),
            all: loadAllSharedFolders(),
        };
    }
    // [서버] is_owner 필드로 owned/joined 구분
    const response = await apiFetch(`${BASE}/get-all`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유폴더 목록을 불러오지 못했습니다.');
    const data = await response.json();
    const folders = data.map(toClient);
    return {
        owned: folders.filter((f) => f.isOwner),
        joined: folders.filter((f) => !f.isOwner),
        all: folders,
    };
};

// POST /dashboard/public/create
// notebookId: 내 개인폴더를 공유폴더로 등록할 때 전달 (선택)
export const createSharedFolderRequest = async (name, password, notebookId = null) => {
    // [로컬] 프론트에서 ID/코드를 직접 생성해서 반환
    if (IS_LOCAL) {
        return {
            id: `owned-shared-${Date.now()}`,
            title: name,
            owner: '',
            ownerId: '',
            isOwner: true,
            members: 1,
            code: makeSharedCode(),
            createdAt: getTodayText(),
            department: '우송대학교',
            hasPassword: !!password,
            description: '',
        };
    }
    // [서버] 서버가 ID/코드 생성 후 반환
    const body = { name, password };
    if (notebookId) body.notebook_id = Number(notebookId);
    const response = await apiFetch(`${BASE}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유폴더 생성에 실패했습니다.');
    return toClient(await response.json());
};

// DELETE /dashboard/public/delete
export const deleteSharedFolderRequest = async (folderId) => {
    // [로컬] ViewModel에서 removeSharedFolderFromStorage() 호출로 처리
    if (IS_LOCAL) return true;
    // [서버]
    const response = await apiFetch(`${BASE}/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ folder_id: Number(folderId) }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

// POST /dashboard/public/enter — 참여 (서버가 암호 검증, 실패 시 403)
export const joinSharedFolderRequest = async (folderId, password) => {
    // [로컬] ViewModel에서 직접 암호 검증 (null 반환으로 알림)
    if (IS_LOCAL) return null;
    // [서버] 서버가 암호 검증, 실패 시 403
    const response = await apiFetch(`${BASE}/enter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ folder_id: Number(folderId), password }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (response.status === 403) throw new Error('암호가 틀렸습니다.');
    if (!response.ok) throw new Error('공유폴더 참여에 실패했습니다.');
    return toClient(await response.json());
};

// POST /dashboard/public/leave — 나가기
export const leaveSharedFolderRequest = async (folderId) => {
    // [로컬] ViewModel에서 상태만 제거
    if (IS_LOCAL) return true;
    // [서버]
    const response = await apiFetch(`${BASE}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ folder_id: Number(folderId) }),
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

// POST /dashboard/public/select — 전체 공유폴더 검색
// IS_LOCAL이면 null 반환 → ViewModel이 로컬 검색으로 처리
export const searchSharedFoldersRequest = async (keyword) => {
    // [로컬] null 반환 → ViewModel이 로컬 데이터에서 직접 검색
    if (IS_LOCAL) return null;
    // [서버]
    const response = await apiFetch(`${BASE}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ keyword }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유폴더 검색에 실패했습니다.');
    const data = await response.json();
    return data.map(toClient);
};

// PATCH /dashboard/public/update — 제목 수정
export const updateSharedFolderRequest = async (folderId, name) => {
    // [로컬] localStorage 제목만 변경
    if (IS_LOCAL) return true;
    // [서버]
    const response = await apiFetch(`${BASE}/update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ folder_id: Number(folderId), name }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유폴더 제목 수정에 실패했습니다.');
    return true;
};

// GET /dashboard/public/open?folderId=1 — 폴더 상세
export const fetchSharedFolderDetailRequest = async (folderId) => {
    // [로컬] 미지원
    if (IS_LOCAL) return null;
    // [서버]
    const response = await apiFetch(`${BASE}/open?folderId=${folderId}`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('공유폴더 정보를 불러오지 못했습니다.');
    return toClient(await response.json());
};
