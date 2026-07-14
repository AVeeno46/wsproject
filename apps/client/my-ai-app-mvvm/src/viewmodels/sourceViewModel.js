// [ViewModel] 소스(파일) 영역의 상태와 로직을 담는 hook.
// 노트북별 파일 목록 로딩과 업로드를 처리하고, 업로드 중/에러 상태를 관리합니다.
import { useEffect, useRef, useState } from "react";
import {
  fetchSourcesRequest,
  uploadSourceRequest,
  registerExternalSourceRequest,
  deleteSourceRequest,
} from "../models/sourceModel";

const POLL_INTERVAL_MS = 3000;

export function useSourceViewModel(conversationId) {
  const [sources, setSources] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total } | null
  // 임베딩이 아직 처리 중(status: "processing")인 소스 id별 폴링 interval을
  // 들고 있다가, ready/failed가 되면 해당 id의 interval만 정지한다.
  const pollTimersRef = useRef(new Map());

  // 대화 전환/언마운트 시 그동안 켜둔 폴링 interval을 전부 정리한다.
  const stopAllPolling = () => {
    pollTimersRef.current.forEach((timerId) => clearInterval(timerId));
    pollTimersRef.current.clear();
  };

  const stopPolling = (sourceId) => {
    const timerId = pollTimersRef.current.get(sourceId);
    if (timerId) {
      clearInterval(timerId);
      pollTimersRef.current.delete(sourceId);
    }
  };

  // 임베딩이 "processing"인 소스 하나를 주기적으로 재조회해서, ready/failed로
  // 바뀌면 그 소스의 status만 갱신하고 폴링을 멈춘다. 상태 전용 엔드포인트가
  // 아직 없어서 fetchSourcesRequest(전체 목록 재조회)를 재사용한다.
  const startPolling = (targetConversationId, sourceId) => {
    if (pollTimersRef.current.has(sourceId)) return;

    const timerId = setInterval(async () => {
      try {
        const data = await fetchSourcesRequest(targetConversationId);
        const latest = (Array.isArray(data) ? data : []).find(
          (s) => String(s.id) === String(sourceId)
        );

        if (!latest || latest.status === "ready" || latest.status === "failed") {
          stopPolling(sourceId);
        }

        if (latest) {
          setSources((prev) =>
            prev.map((s) => (String(s.id) === String(sourceId) ? { ...s, status: latest.status } : s))
          );
        }
      } catch {
        // 폴링 중 일시적 네트워크 오류는 조용히 무시하고 다음 주기에 재시도
      }
    }, POLL_INTERVAL_MS);

    pollTimersRef.current.set(sourceId, timerId);
  };

  useEffect(() => {
    let isMounted = true;
    stopAllPolling();

    const loadSources = async () => {
      if (!conversationId) {
        if (isMounted) setSources([]);
        return;
      }

      try {
        const data = await fetchSourcesRequest(conversationId);
        const list = Array.isArray(data) ? data : [];

        if (isMounted) {
          setSources(list);
          list
            .filter((s) => s.status === "processing")
            .forEach((s) => startPolling(conversationId, s.id));
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
      stopAllPolling();
    };
  }, [conversationId]);

  const uploadFile = async (file, metadata) => {
    if (!conversationId || !file) {
      console.error("업로드 실패: conversationId 또는 file 없음", {
        conversationId,
        file,
      });
      setUploadError(
        !conversationId ? "먼저 대화를 선택하거나 새로 만들어 주세요." : "업로드할 파일이 없습니다."
      );
      return null;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const uploaded = await uploadSourceRequest(conversationId, file, metadata);
      // File 객체를 인메모리로 붙여 HwpxEditor 자동 로드에 사용 (세션 내에서만 유효)
      const newSource = { ...uploaded, file };

      setSources((prev) => {
        const exists = prev.some((source) => source.id === newSource.id);

        if (exists) return prev;

        return [...prev, newSource];
      });

      if (newSource.status === "processing") {
        startPolling(conversationId, newSource.id);
      }

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

  // 자료 등록 페이지(사업단/주제/설명 메타데이터 포함) 전용 순차 업로드.
  // entries: [{ file, business, topic, description }]
  const registerFiles = async (entries) => {
    const list = Array.from(entries || []);
    if (list.length === 0) return [];

    const uploaded = [];
    setUploadProgress({ done: 0, total: list.length });

    for (const entry of list) {
      const { file, business, topic, description } = entry;
      const result = await uploadFile(file, { business, topic, description });
      if (result) uploaded.push(result);
      setUploadProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setUploadProgress(null);
    return uploaded;
  };

  // 외부 자료(URL) 등록 — file-registration-metadata-contract.md §2
  const registerExternalSource = async (payload) => {
    if (!conversationId) {
      console.error("외부 자료 등록 실패: conversationId 없음");
      setUploadError("먼저 대화를 선택하거나 새로 만들어 주세요.");
      return null;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const registered = await registerExternalSourceRequest(conversationId, payload);
      setSources((prev) => {
        const exists = prev.some((source) => source.id === registered.id);
        if (exists) return prev;
        return [...prev, registered];
      });

      if (registered.status === "processing") {
        startPolling(conversationId, registered.id);
      }

      return registered;
    } catch (error) {
      console.error("외부 자료 등록 실패:", error);
      setUploadError(error.message || "외부 자료 등록에 실패했습니다.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const deleteSource = async (sourceId) => {
    try {
      await deleteSourceRequest(conversationId, sourceId);
      stopPolling(sourceId);
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
    registerFiles,
    registerExternalSource,
    deleteSource,
  };
}