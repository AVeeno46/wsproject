import { useState } from 'react';
import { reviewSourceRequest } from '../models/sourceModel';

export const useDocumentViewModel = (notebookId) => {
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const viewDocument = async (fileId) => {
        setIsLoading(true);
        try {
            const data = await reviewSourceRequest(notebookId, fileId);
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
