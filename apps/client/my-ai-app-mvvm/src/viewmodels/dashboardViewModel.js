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
        try {
            const newNotebook = await createNotebookRequest(title);
            await fetchNotebooks();
            return newNotebook;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    const removeNotebook = async (notebookId) => {
        const success = await deleteNotebookRequest(notebookId);
        if (success) {
            setNotebooks((prev) => prev.filter((n) => n.id !== notebookId));
        } else {
            setError('삭제에 실패했습니다.');
        }
    };

    const updateNotebookTitle = async (notebookId, title) => {
        try {
            const updatedNotebook = await updateNotebookTitleRequest(notebookId, title);

            setNotebooks((prev) =>
                prev.map((note) =>
                    String(note.id) === String(notebookId)
                        ? { ...note, title: updatedNotebook?.title || title }
                        : note
                )
            );

            return updatedNotebook;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    useEffect(() => {
        fetchNotebooks();
    }, []);

    return {
        notebooks,
        loading,
        error,
        createNotebook,
        removeNotebook,
        updateNotebookTitle,
        refresh: fetchNotebooks,
    };
};