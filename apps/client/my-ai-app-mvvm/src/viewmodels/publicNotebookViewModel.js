import { useState, useEffect } from 'react';
import {
    fetchPublicNotebooksRequest,
    createPublicNotebookRequest,
    enterPublicNotebookRequest,
    leavePublicNotebookRequest,
    deletePublicNotebookRequest,
    selectPublicNotebookRequest,
} from '../models/publicNotebookModel';

export const usePublicNotebookViewModel = () => {
    const [notebooks, setNotebooks] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);

    const fetchNotebooks = async () => {
        setLoading(true);
        try {
            const data = await fetchPublicNotebooksRequest();
            setNotebooks(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const createNotebook = async (title, password) => {
        try {
            const newNotebook = await createPublicNotebookRequest(title, password);
            await fetchNotebooks();
            return newNotebook;
        } catch (err) {
            setError(err.message);
            return null;
        }
    };

    const enterNotebook = async (notebookId, password) => {
        try {
            const success = await enterPublicNotebookRequest(notebookId, password);
            if (success) await fetchNotebooks();
            return success;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const leaveNotebook = async (notebookId) => {
        const success = await leavePublicNotebookRequest(notebookId);
        if (success) setNotebooks((prev) => prev.filter((n) => n.dashboard_id !== notebookId));
        else setError('나가기에 실패했습니다.');
    };

    const removeNotebook = async (notebookId) => {
        const success = await deletePublicNotebookRequest(notebookId);
        if (success) setNotebooks((prev) => prev.filter((n) => n.dashboard_id !== notebookId));
        else setError('삭제에 실패했습니다.');
    };

    const searchNotebooks = async (keyword) => {
        setIsSearching(true);
        setSearchResults([]);
        try {
            const results = await selectPublicNotebookRequest(keyword);
            setSearchResults(results);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        fetchNotebooks();
    }, []);

    return {
        notebooks,
        searchResults,
        loading,
        isSearching,
        error,
        createNotebook,
        enterNotebook,
        leaveNotebook,
        removeNotebook,
        searchNotebooks,
        refresh: fetchNotebooks,
    };
};
