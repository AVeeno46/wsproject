import { useState } from 'react';
import { fetchDocumentTextRequest } from '../models/sourceModel';

export const useDocumentViewModel = () => {
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const viewDocument = async (sourceId) => {
        setIsLoading(true);
        try {
            const data = await fetchDocumentTextRequest(sourceId);
            setSelectedDoc(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        selectedDoc,
        isLoading,
        error,
        viewDocument,
    };
};
