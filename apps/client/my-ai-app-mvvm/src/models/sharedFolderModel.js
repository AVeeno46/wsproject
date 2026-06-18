// 공유폴더 관련 localStorage 데이터 접근 계층.
// 현재는 서버 엔드포인트가 없어 localStorage로 처리하며,
// 추후 .NET 서버 연동 시 이 파일의 함수만 fetch 기반으로 교체하면 됩니다.

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
