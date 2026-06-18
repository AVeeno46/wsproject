import { useState, useEffect, useCallback } from 'react';
import * as sharedFolderModel from '../models/sharedFolderModel';

// 공유폴더 상태와 비즈니스 로직을 담당하는 ViewModel.
// 모달/메뉴 같은 순수 UI 상태는 View(DashboardView)에 남겨둡니다.
export const useSharedFolderViewModel = ({ currentUserId, profileName }) => {
    const [joinedSharedFolders, setJoinedSharedFolders] = useState(() =>
        sharedFolderModel.loadJoinedSharedFolders(currentUserId)
    );
    const [ownedSharedFolders, setOwnedSharedFolders] = useState(() =>
        sharedFolderModel.loadOwnedSharedFolders(currentUserId)
    );
    const [allSharedFolders, setAllSharedFolders] = useState(() =>
        sharedFolderModel.loadAllSharedFolders()
    );
    const [sharedSearchResults, setSharedSearchResults] = useState([]);
    const [isSharedSearching, setIsSharedSearching] = useState(false);

    // 로그인 계정이 바뀌면 해당 계정의 목록으로 다시 로드합니다.
    useEffect(() => {
        setJoinedSharedFolders(sharedFolderModel.loadJoinedSharedFolders(currentUserId));
        setOwnedSharedFolders(sharedFolderModel.loadOwnedSharedFolders(currentUserId));
        setAllSharedFolders(sharedFolderModel.loadAllSharedFolders());
    }, [currentUserId]);

    useEffect(() => {
        sharedFolderModel.persistJoinedSharedFolders(currentUserId, joinedSharedFolders);
    }, [joinedSharedFolders, currentUserId]);

    useEffect(() => {
        sharedFolderModel.persistOwnedSharedFolders(currentUserId, ownedSharedFolders);
        // 내가 만든 공유폴더도 검색용 전체 목록에 같이 살려둡니다.
        setAllSharedFolders((prev) =>
            sharedFolderModel.dedupeFolders([...prev, ...ownedSharedFolders])
        );
    }, [ownedSharedFolders, currentUserId]);

    useEffect(() => {
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

    // 공유폴더 신규 생성 (제목 + 암호). 생성된 폴더를 반환합니다.
    const createSharedFolder = useCallback(
        (title, password) => {
            const newSharedFolder = {
                id: `owned-shared-${Date.now()}`,
                title,
                owner: profileName,
                ownerId: currentUserId,
                department: '우송대학교',
                members: 1,
                code: sharedFolderModel.makeSharedCode(),
                description: `${profileName}님이 만든 공유폴더입니다.`,
                createdAt: sharedFolderModel.getTodayText(),
                lastAccess: '방금 전',
                hasPassword: true,
                // 프론트 임시 테스트용. 실제 서버에서는 해시 저장으로 바꿔야 합니다.
                password,
            };

            sharedFolderModel.setSharedFolderTitle(newSharedFolder.id, newSharedFolder.title);
            setOwnedSharedFolders((prev) => [newSharedFolder, ...prev]);
            setAllSharedFolders((prev) => [newSharedFolder, ...prev]);

            return newSharedFolder;
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
                localStorage.getItem(`notebookShared:${notebookId}`) === 'true' ||
                Boolean(findSharedFolderForNotebook(notebookId))
            );
        },
        [findSharedFolderForNotebook]
    );

    // 내 폴더를 공유폴더로 추가. 성공 시 { sourceNotebookId, title } 반환.
    const shareNotebookAsFolder = useCallback(
        (notebook, password) => {
            const sourceNotebookId = notebook.id;
            const sharedTitle = notebook.title?.trim() || '새 폴더';

            const alreadySharedFolder = findSharedFolderForNotebook(sourceNotebookId);

            const nextSharedFolder = {
                id: alreadySharedFolder?.id || `owned-shared-${Date.now()}`,
                sourceNotebookId,
                originalNotebookId: sourceNotebookId,
                title: sharedTitle,
                owner: profileName,
                ownerId: currentUserId,
                department: '우송대학교',
                members: alreadySharedFolder?.members || 1,
                code: alreadySharedFolder?.code || sharedFolderModel.makeSharedCode(),
                description: `${profileName}님이 만든 공유폴더입니다.`,
                createdAt: alreadySharedFolder?.createdAt || sharedFolderModel.getTodayText(),
                lastAccess: '방금 전',
                hasPassword: true,
                password,
            };

            sharedFolderModel.setSharedFolderTitle(nextSharedFolder.id, nextSharedFolder.title);
            sharedFolderModel.markNotebookShared(sourceNotebookId);

            setOwnedSharedFolders((prev) => upsertSharedFolder(prev, nextSharedFolder));
            setAllSharedFolders((prev) => upsertSharedFolder(prev, nextSharedFolder));

            return { sourceNotebookId, title: sharedTitle };
        },
        [currentUserId, profileName, findSharedFolderForNotebook]
    );

    const updateOwnedSharedFolderTitle = useCallback((folderId, nextTitle) => {
        sharedFolderModel.setSharedFolderTitle(folderId, nextTitle);

        const applyTitle = (list) =>
            list.map((folder) =>
                folder.id === folderId ? { ...folder, title: nextTitle } : folder
            );

        setOwnedSharedFolders(applyTitle);
        setSharedSearchResults(applyTitle);
        setAllSharedFolders(applyTitle);
    }, []);

    const deleteOwnedSharedFolder = useCallback(
        (folderId) => {
            const targetFolder =
                ownedSharedFolders.find((f) => String(f.id) === String(folderId)) ||
                allSharedFolders.find((f) => String(f.id) === String(folderId)) ||
                sharedSearchResults.find((f) => String(f.id) === String(folderId)) ||
                { id: folderId };

            // 공유폴더 삭제 시: 내가 만든 목록 + 다른 계정 참가 목록 + 원본 "공유 중" 배지까지 제거
            sharedFolderModel.removeSharedFolderFromStorage(targetFolder);

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

    const leaveJoinedSharedFolder = useCallback((folderId) => {
        setJoinedSharedFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    }, []);

    // 공유폴더 참여. 성공 시 입장할 폴더를 반환, 실패 시 throw.
    const joinSharedFolder = useCallback(
        (folderId, inputPassword) => {
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
        },
        [sharedSearchResults]
    );

    const searchSharedFolders = useCallback(
        (keyword) => {
            const trimmed = keyword.trim();

            if (!trimmed) {
                setSharedSearchResults([]);
                setIsSharedSearching(false);
                return;
            }

            // 서버 연결 전 임시 검색 — 전체/예전/계정별 저장소를 모두 뒤져서 찾습니다.
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
