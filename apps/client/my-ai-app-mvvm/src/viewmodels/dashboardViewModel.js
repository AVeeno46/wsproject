// [ViewModel] 대시보드 화면의 상태와 로직을 담는 hook.
// 노트북 목록 로딩/생성/삭제/제목수정을 처리하고 loading·error 상태를 관리합니다.
import { useState, useEffect } from 'react';
import {
    fetchNotebooksRequest,
    createNotebookRequest,
    deleteNotebookRequest,
    updateNotebookTitleRequest,
} from '../models/notebookModel';

export const useDashboardViewModel = () => {
    const [notebooks, setNotebooks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchNotebooks = async () => {
        setLoading(true);
        try {
            const data = await fetchNotebooksRequest();
            setNotebooks(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const createNotebook = async (title) => {
        const trimmed = title.trim().toLowerCase();
        const isDuplicate = notebooks.some((n) => n.title.trim().toLowerCase() === trimmed);
        if (isDuplicate) {
            const err = new Error('같은 이름의 대화가 이미 있습니다.');
            setError(err.message);
            throw err;
        }
        try {
            const newNotebook = await createNotebookRequest(title);
            await fetchNotebooks();
            return newNotebook;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const removeNotebook = async (conversationId) => {
        try {
            const success = await deleteNotebookRequest(conversationId);
            if (success) {
                setNotebooks((prev) => prev.filter((n) => n.id !== conversationId));
            } else {
                const err = new Error('삭제에 실패했습니다.');
                setError(err.message);
                throw err;
            }
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const updateNotebookTitle = async (conversationId, title) => {
        const trimmed = title.trim().toLowerCase();
        const isDuplicate = notebooks.some(
            (n) => String(n.id) !== String(conversationId) && n.title.trim().toLowerCase() === trimmed
        );
        if (isDuplicate) {
            const err = new Error('같은 이름의 대화가 이미 있습니다.');
            setError(err.message);
            throw err;
        }
        try {
            const updatedNotebook = await updateNotebookTitleRequest(conversationId, title);

            setNotebooks((prev) =>
                prev.map((note) =>
                    String(note.id) === String(conversationId)
                        ? { ...note, title: updatedNotebook?.title || title }
                        : note
                )
            );

            return updatedNotebook;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    useEffect(() => {
        fetchNotebooks();
    }, []);

    const clearError = () => setError(null);

    return {
        notebooks,
        loading,
        error,
        clearError,
        createNotebook,
        removeNotebook,
        updateNotebookTitle,
        refresh: fetchNotebooks,
    };
};