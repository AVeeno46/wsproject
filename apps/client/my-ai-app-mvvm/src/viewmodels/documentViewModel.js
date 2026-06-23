// [ViewModel] 문서 뷰어의 상태와 로직을 담는 hook.
// 선택한 소스의 텍스트를 불러와 화면에 표시하고 로딩/에러 상태를 관리합니다.
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
