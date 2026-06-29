import { useState, useEffect, useCallback } from 'react';
import { IS_LOCAL } from '../constants/constants';
import * as sharedFolderModel from '../models/sharedFolderModel';

// 공유폴더 상태와 비즈니스 로직을 담당하는 ViewModel.
// 모달/메뉴 같은 순수 UI 상태는 View(DashboardView)에 남겨둡니다.
export const useSharedFolderViewModel = ({ currentUserId, profileName }) => {
    const [joinedSharedFolders, setJoinedSharedFolders] = useState([]);
    const [ownedSharedFolders, setOwnedSharedFolders] = useState([]);
    const [allSharedFolders, setAllSharedFolders] = useState([]);
    const [sharedSearchResults, setSharedSearchResults] = useState([]);
    const [isSharedSearching, setIsSharedSearching] = useState(false);

    // 마운트 / 계정 변경 시 서버(또는 localStorage)에서 목록 로드
    useEffect(() => {
        if (!currentUserId) return;
        sharedFolderModel.fetchAllSharedFoldersRequest(currentUserId).then(({ owned, joined, all }) => {
            setOwnedSharedFolders(owned);
            setJoinedSharedFolders(joined);
            setAllSharedFolders(all);
        });
    }, [currentUserId]);

    // [로컬] 상태 변경 시 localStorage에 동기화 (서버 모드에서는 서버가 source of truth)
    useEffect(() => {
        if (!IS_LOCAL) return;
        sharedFolderModel.persistJoinedSharedFolders(currentUserId, joinedSharedFolders);
    }, [joinedSharedFolders, currentUserId]);

    useEffect(() => {
        if (!IS_LOCAL) return;
        sharedFolderModel.persistOwnedSharedFolders(currentUserId, ownedSharedFolders);
        setAllSharedFolders((prev) =>
            sharedFolderModel.dedupeFolders([...prev, ...ownedSharedFolders])
        );
    }, [ownedSharedFolders, currentUserId]);

    useEffect(() => {
        if (!IS_LOCAL) return;
        sharedFolderModel.persistAllSharedFolders(allSharedFolders);
    }, [allSharedFolders]);

    // 제목이 동기화된(원본 노트북 제목 반영) 표시용 목록
    const syncedOwnedSharedFolders = sharedFolderModel.syncSharedFolderTitles(ownedSharedFolders);
    const syncedJoinedSharedFolders = sharedFolderModel.syncSharedFolderTitles(joinedSharedFolders);
    const syncedSharedSearchResults = sharedFolderModel.syncSharedFolderTitles(sharedSearchResults);

    const upsertSharedFolder = (list, folder) => {
        const exists = list.some((item) => String(item.id) === String(folder.id));
        if (exists) {
            return list.map((item) =>
                String(item.id) === String(folder.id) ? folder : item
            );
        }
        return [folder, ...list];
    };

    // 공유폴더 신규 생성. 성공 시 생성된 폴더를 반환합니다.
    const createSharedFolder = useCallback(
        async (title, password) => {
            const trimmed = title.trim().toLowerCase();
            const isDuplicate = ownedSharedFolders.some((f) => f.title.trim().toLowerCase() === trimmed);
            if (isDuplicate) throw new Error('같은 이름의 공유폴더가 이미 있습니다.');

            const newFolder = await sharedFolderModel.createSharedFolderRequest(title, password);
            const folderWithMeta = {
                ...newFolder,
                owner: newFolder.owner || profileName,
                ownerId: newFolder.ownerId || currentUserId,
                description: newFolder.description || `${profileName}님이 만든 공유폴더입니다.`,
                lastAccess: '방금 전',
                isOwner: true,
            };

            if (IS_LOCAL) sharedFolderModel.setSharedFolderTitle(folderWithMeta.id, folderWithMeta.title);
            setOwnedSharedFolders((prev) => [folderWithMeta, ...prev]);
            setAllSharedFolders((prev) => [folderWithMeta, ...prev]);

            return folderWithMeta;
        },
        [currentUserId, profileName]
    );

    const findSharedFolderForNotebook = useCallback(
        (notebookId) => {
            const targetId = String(notebookId);
            const match = (folder) =>
                String(folder.sourceNotebookId) === targetId ||
                String(folder.originalNotebookId) === targetId;

            return (
                ownedSharedFolders.find(match) || allSharedFolders.find(match) || null
            );
        },
        [ownedSharedFolders, allSharedFolders]
    );

    const isNotebookShared = useCallback(
        (note) => {
            if (!note?.id) return false;
            const notebookId = String(note.id);
            return (
                note.isShared ||
                (IS_LOCAL && localStorage.getItem(`notebookShared:${notebookId}`) === 'true') ||
                Boolean(findSharedFolderForNotebook(notebookId))
            );
        },
        [findSharedFolderForNotebook]
    );

    // 내 개인폴더를 공유폴더로 등록. 성공 시 { sourceNotebookId, title } 반환.
    const shareNotebookAsFolder = useCallback(
        async (notebook, password) => {
            const sourceNotebookId = notebook.id;
            const sharedTitle = notebook.title?.trim() || '새 폴더';

            const alreadySharedFolder = findSharedFolderForNotebook(sourceNotebookId);

            const created = await sharedFolderModel.createSharedFolderRequest(
                sharedTitle,
                password,
                sourceNotebookId
            );

            const nextSharedFolder = {
                ...created,
                id: alreadySharedFolder?.id || created.id,
                sourceNotebookId,
                originalNotebookId: sourceNotebookId,
                owner: created.owner || profileName,
                ownerId: created.ownerId || currentUserId,
                members: alreadySharedFolder?.members || created.members,
                code: alreadySharedFolder?.code || created.code,
                description: created.description || `${profileName}님이 만든 공유폴더입니다.`,
                createdAt: alreadySharedFolder?.createdAt || created.createdAt,
                lastAccess: '방금 전',
                isOwner: true,
            };

            if (IS_LOCAL) {
                sharedFolderModel.setSharedFolderTitle(nextSharedFolder.id, nextSharedFolder.title);
                sharedFolderModel.markNotebookShared(sourceNotebookId);
            }

            setOwnedSharedFolders((prev) => upsertSharedFolder(prev, nextSharedFolder));
            setAllSharedFolders((prev) => upsertSharedFolder(prev, nextSharedFolder));

            return { sourceNotebookId, title: sharedTitle };
        },
        [currentUserId, profileName, findSharedFolderForNotebook]
    );

    const updateOwnedSharedFolderTitle = useCallback(async (folderId, nextTitle) => {
        const trimmed = nextTitle.trim().toLowerCase();
        const isDuplicate = ownedSharedFolders.some(
            (f) => String(f.id) !== String(folderId) && f.title.trim().toLowerCase() === trimmed
        );
        if (isDuplicate) throw new Error('같은 이름의 공유폴더가 이미 있습니다.');

        await sharedFolderModel.updateSharedFolderRequest(folderId, nextTitle);

        sharedFolderModel.setSharedFolderTitle(folderId, nextTitle);

        const applyTitle = (list) =>
            list.map((folder) =>
                folder.id === folderId ? { ...folder, title: nextTitle } : folder
            );

        setOwnedSharedFolders(applyTitle);
        setSharedSearchResults(applyTitle);
        setAllSharedFolders(applyTitle);
    }, [ownedSharedFolders]);

    const deleteOwnedSharedFolder = useCallback(
        async (folderId) => {
            const targetFolder =
                ownedSharedFolders.find((f) => String(f.id) === String(folderId)) ||
                allSharedFolders.find((f) => String(f.id) === String(folderId)) ||
                sharedSearchResults.find((f) => String(f.id) === String(folderId)) ||
                { id: folderId };

            await sharedFolderModel.deleteSharedFolderRequest(folderId);

            if (IS_LOCAL) sharedFolderModel.removeSharedFolderFromStorage(targetFolder);

            const shouldKeepFolder = (folder) => {
                const sameId = String(folder.id) === String(targetFolder.id);
                const sameCode = targetFolder.code && folder.code === targetFolder.code;
                const sameSource =
                    targetFolder.sourceNotebookId &&
                    (String(folder.sourceNotebookId) === String(targetFolder.sourceNotebookId) ||
                        String(folder.originalNotebookId) === String(targetFolder.sourceNotebookId));
                const sameTitle = targetFolder.title && folder.title === targetFolder.title;
                return !(sameId || sameCode || sameSource || sameTitle);
            };

            setOwnedSharedFolders((prev) => prev.filter(shouldKeepFolder));
            setJoinedSharedFolders((prev) => prev.filter(shouldKeepFolder));
            setSharedSearchResults((prev) => prev.filter(shouldKeepFolder));
            setAllSharedFolders((prev) => prev.filter(shouldKeepFolder));
        },
        [ownedSharedFolders, allSharedFolders, sharedSearchResults]
    );

    const leaveJoinedSharedFolder = useCallback(async (folderId) => {
        await sharedFolderModel.leaveSharedFolderRequest(folderId);
        setJoinedSharedFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    }, []);

    // 공유폴더 참여. 성공 시 입장할 폴더를 반환, 실패 시 throw.
    const joinSharedFolder = useCallback(
        async (folderId, inputPassword) => {
            // [로컬] 검색 결과에서 직접 암호 검증
            if (IS_LOCAL) {
                const target = sharedSearchResults.find((folder) => folder.id === folderId);
                if (!target) throw new Error('공유폴더를 찾을 수 없습니다.');
                if (target.password && target.password !== inputPassword) {
                    throw new Error('암호가 틀렸습니다.');
                }
                setJoinedSharedFolders((prev) => {
                    const alreadyJoined = prev.some((item) => item.id === target.id);
                    if (alreadyJoined) return prev;
                    return [target, ...prev];
                });
                sharedFolderModel.setSharedFolderTitle(target.id, target.title);
                return target;
            }

            // [서버] 서버가 암호 검증 (403이면 throw)
            const joined = await sharedFolderModel.joinSharedFolderRequest(folderId, inputPassword);
            setJoinedSharedFolders((prev) => {
                const alreadyJoined = prev.some((item) => item.id === joined.id);
                if (alreadyJoined) return prev;
                return [joined, ...prev];
            });
            return joined;
        },
        [sharedSearchResults]
    );

    const searchSharedFolders = useCallback(
        async (keyword) => {
            const trimmed = keyword.trim();

            if (!trimmed) {
                setSharedSearchResults([]);
                setIsSharedSearching(false);
                return;
            }

            // [서버] API 검색
            const serverResults = await sharedFolderModel.searchSharedFoldersRequest(trimmed);
            if (serverResults !== null) {
                setSharedSearchResults(serverResults);
                setIsSharedSearching(false);
                return;
            }

            // [로컬] 로컬 데이터에서 검색
            const searchable = sharedFolderModel.getSearchableSharedFolders(currentUserId, [
                ...allSharedFolders,
                ...ownedSharedFolders,
                ...joinedSharedFolders,
            ]);
            const lowered = trimmed.toLowerCase();
            const results = sharedFolderModel
                .syncSharedFolderTitles(searchable)
                .filter((folder) =>
                    [folder.title, folder.owner, folder.department, folder.code, folder.description]
                        .join(' ')
                        .toLowerCase()
                        .includes(lowered)
                );

            setSharedSearchResults(results);
            setIsSharedSearching(false);
        },
        [currentUserId, allSharedFolders, ownedSharedFolders, joinedSharedFolders]
    );

    return {
        // 표시용(제목 동기화) 목록
        joinedSharedFolders: syncedJoinedSharedFolders,
        ownedSharedFolders: syncedOwnedSharedFolders,
        searchResults: syncedSharedSearchResults,
        isSharedSearching,
        // 조회
        findSharedFolderForNotebook,
        isNotebookShared,
        // 동작
        createSharedFolder,
        shareNotebookAsFolder,
        updateOwnedSharedFolderTitle,
        deleteOwnedSharedFolder,
        leaveJoinedSharedFolder,
        joinSharedFolder,
        searchSharedFolders,
    };
};
