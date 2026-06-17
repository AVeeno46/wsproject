import { useState, useEffect } from 'react';
import {
    fetchNotebooksRequest,
    createNotebookRequest,
    deleteNotebookRequest,
    updateNotebookTitleRequest,
} from '../models/notebookModel';

// 서버 필드(dashboard_id, dashboard_name)를 뷰 필드(id, title)로 매핑
const mapNotebook = (n) => ({
    ...n,
    id: n.dashboard_id ?? n.id,
    title: n.dashboard_name ?? n.title,
});

export const useDashboardViewModel = () => {
    const [notebooks, setNotebooks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchNotebooks = async () => {
        setLoading(true);
        try {
            const data = await fetchNotebooksRequest();
            setNotebooks(data.map(mapNotebook));
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
            return mapNotebook(newNotebook);
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
            const updated = await updateNotebookTitleRequest(notebookId, title);
            setNotebooks((prev) =>
                prev.map((n) =>
                    String(n.id) === String(notebookId)
                        ? { ...n, title: updated?.title || title }
                        : n
                )
            );
            return updated;
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
