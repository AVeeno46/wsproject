// [ViewModel] 소스(파일) 영역의 상태와 로직을 담는 hook.
// 노트북별 파일 목록 로딩과 업로드를 처리하고, 업로드 중/에러 상태를 관리합니다.
import { useEffect, useState } from "react";
import {
  fetchSourcesRequest,
  uploadSourceRequest,
  deleteSourceRequest,
} from "../models/sourceModel";

export function useSourceViewModel(conversationId) {
  const [sources, setSources] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total } | null

  useEffect(() => {
    let isMounted = true;

    const loadSources = async () => {
      if (!conversationId) {
        if (isMounted) setSources([]);
        return;
      }

      try {
        const data = await fetchSourcesRequest(conversationId);

        if (isMounted) {
          setSources(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("소스 목록 불러오기 실패:", error);

        if (isMounted) {
          setSources([]);
          setUploadError(error.message || "파일 목록을 불러오지 못했습니다.");
        }
      }
    };

    loadSources();

    return () => {
      isMounted = false;
    };
  }, [conversationId]);

  const uploadFile = async (file) => {
    if (!conversationId || !file) {
      console.error("업로드 실패: conversationId 또는 file 없음", {
        conversationId,
        file,
      });
      return null;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const uploaded = await uploadSourceRequest(conversationId, file);
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

  // 여러 파일을 순차 업로드 — 서버가 동시에 여러 문서를 임베딩 요청받지 않도록
  // 한 파일의 업로드 응답을 받은 뒤에 다음 파일을 보낸다. 진행 상황은
  // uploadProgress({done, total})로 노출해 화면에 "N개 중 M번째"를 표시할 수 있게 한다.
  const uploadFiles = async (files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return [];

    const uploaded = [];
    setUploadProgress({ done: 0, total: list.length });

    for (const file of list) {
      const result = await uploadFile(file);
      if (result) uploaded.push(result);
      setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setUploadProgress(null);
    return uploaded;
  };

  const deleteSource = async (sourceId) => {
    try {
      await deleteSourceRequest(conversationId, sourceId);
      setSources((prev) => prev.filter((s) => String(s.id) !== String(sourceId)));
      return true;
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      setUploadError(error.message || "파일 삭제에 실패했습니다.");
      return false;
    }
  };

  const clearUploadError = () => setUploadError(null);

  return {
    sources,
    isUploading,
    uploadError,
    uploadProgress,
    clearUploadError,
    uploadFile,
    uploadFiles,
    deleteSource,
  };
}