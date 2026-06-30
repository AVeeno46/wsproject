// [ViewModel] 소스(파일) 영역의 상태와 로직을 담는 hook.
// 노트북별 파일 목록 로딩과 업로드를 처리하고, 업로드 중/에러 상태를 관리합니다.
import { useEffect, useState } from "react";
import {
  fetchSourcesRequest,
  uploadSourceRequest,
  deleteSourceRequest,
} from "../models/sourceModel";

export function useSourceViewModel(notebookId) {
  const [sources, setSources] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

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
    setUploadError(null);

    try {
      const uploaded = await uploadSourceRequest(notebookId, file);
      // File 객체를 인메모리로 붙여 HwpxEditor 자동 로드에 사용 (세션 내에서만 유효)
      const newSource = { ...uploaded, file };

      setSources((prev) => {
        const exists = prev.some((source) => source.id === newSource.id);

        if (exists) return prev;

        return [...prev, newSource];
      });

      return newSource;
    } catch (error) {
      console.error("파일 업로드 실패:", error);
      setUploadError(error.message || "파일 업로드에 실패했습니다.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteSource = async (sourceId) => {
    try {
      await deleteSourceRequest(notebookId, sourceId);
      setSources((prev) => prev.filter((s) => String(s.id) !== String(sourceId)));
      return true;
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      return false;
    }
  };

  const clearUploadError = () => setUploadError(null);

  return {
    sources,
    isUploading,
    uploadError,
    clearUploadError,
    uploadFile,
    deleteSource,
  };
}