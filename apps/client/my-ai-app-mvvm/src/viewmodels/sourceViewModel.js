import { useState, useEffect } from 'react';
import { fetchSourcesRequest, uploadSourceRequest, openSourceRequest, selectDocumentRequest, deleteSourceRequest } from '../models/sourceModel';

export const useSourceViewModel = (notebookId) => {
    const [sources, setSources] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState(null);
    const [error, setError] = useState(null);

    const fetchSources = async () => {
        try {
            const data = await fetchSourcesRequest(notebookId);
            setSources(data);
        } catch (err) {
            setError(err.message);
        }
    };

    const uploadFile = async (fileObject) => {
        setIsUploading(true);
        try {
            const newSource = await uploadSourceRequest(notebookId, fileObject);
            setSources((prev) => [...prev, newSource]);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setIsUploading(false);
        }
    };

    const selectDocument = async (question) => {
        setIsSearching(true);
        setSearchResult(null);
        try {
            const result = await selectDocumentRequest(notebookId, question);
            setSearchResult(result); // { file_text, file_name, file_id }
            return result;
        } catch (err) {
            setError(err.message);
            return null;
        } finally {
            setIsSearching(false);
        }
    };

    const openSource = async (source) => {
        try {
            const data = await openSourceRequest(notebookId, source.file_id);
            return { ...source, file_url: data?.file_url ?? null };
        } catch (err) {
            setError(err.message);
            return source;
        }
    };

    const removeSource = async (fileId) => {
        const success = await deleteSourceRequest(notebookId, fileId);
        if (success) setSources((prev) => prev.filter((s) => s.file_id !== fileId));
    };

    useEffect(() => {
        if (notebookId) fetchSources();
    }, [notebookId]);

    return {
        sources,
        isUploading,
        isSearching,
        searchResult,
        error,
        uploadFile,
        openSource,
        selectDocument,
        removeSource,
        refresh: fetchSources,
    };
};
