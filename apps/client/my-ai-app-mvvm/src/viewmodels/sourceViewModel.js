import { useEffect, useState } from "react";
import {
  fetchSourcesRequest,
  uploadSourceRequest,
} from "../models/sourceModel";

export function useSourceViewModel(notebookId) {
  const [sources, setSources] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadSources = async () => {
      if (!notebookId) {
        if (isMounted) setSources([]);
        return;
      }

      try {
        const data = await fetchSourcesRequest(notebookId);

        if (isMounted) {
          setSources(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("소스 목록 불러오기 실패:", error);

        if (isMounted) {
          setSources([]);
        }
      }
    };

    loadSources();

    return () => {
      isMounted = false;
    };
  }, [notebookId]);

  const uploadFile = async (file) => {
    if (!notebookId || !file) {
      console.error("업로드 실패: notebookId 또는 file 없음", {
        notebookId,
        file,
      });
      return null;
    }

    setIsUploading(true);

    try {
      const newSource = await uploadSourceRequest(notebookId, file);

      setSources((prev) => {
        const exists = prev.some((source) => source.id === newSource.id);

        if (exists) return prev;

return [...prev, newSource];      });

      return newSource;
    } catch (error) {
      console.error("파일 업로드 실패:", error);
      alert(error.message || "파일 업로드에 실패했습니다.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return {
    sources,
    isUploading,
    uploadFile,
  };
}