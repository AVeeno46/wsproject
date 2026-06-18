import { API_URL, IS_LOCAL, MAX_FILE_SIZE_MB } from "../constants/constants";
import { getAuthHeader, handleUnauthorized } from "./modelUtils";

const lsKey = (notebookId) => `local_sources_${notebookId}`;

const getLocalSources = (notebookId) => {
  try {
    return JSON.parse(localStorage.getItem(lsKey(notebookId)) || "[]");
  } catch {
    return [];
  }
};

const saveLocalSources = (notebookId, list) => {
  localStorage.setItem(lsKey(notebookId), JSON.stringify(list));
};

// 대시보드 카드의 "소스 개수" 계산용 — 삭제된 소스를 제외한 로컬 소스 수.
const getSourceKeysForCount = (source) => {
  if (!source) return [];

  const keys = [];
  const name = source.name || source.file?.name || "";
  const size = source.size || source.file?.size || 0;
  const lastModified = source.lastModified || source.file?.lastModified || "";

  // NoteDetailView에서 삭제 저장할 때 파일정보 기반 key를 먼저 저장하므로
  // 목록의 "소스 개수" 계산도 같은 방식으로 비교해야 합니다.
  if (name || size || lastModified) {
    keys.push(`${name}-${size}-${lastModified}`);
  }

  if (source.id) keys.push(String(source.id));
  if (source.sourceId) keys.push(String(source.sourceId));
  if (source.fileId) keys.push(String(source.fileId));
  if (source.previewUrl) keys.push(String(source.previewUrl));

  return [...new Set(keys.filter(Boolean))];
};

export const getLocalSourceCount = (notebookId) => {
  try {
    const saved = localStorage.getItem(`local_sources_${notebookId}`);
    const deleted = localStorage.getItem(`deletedSources:${notebookId}`);

    const sources = saved ? JSON.parse(saved) : [];
    const deletedKeys = deleted ? JSON.parse(deleted) : [];

    return sources.filter((source) => {
      const sourceKeys = getSourceKeysForCount(source);
      return !sourceKeys.some((key) => deletedKeys.includes(key));
    }).length;
  } catch {
    return 0;
  }
};

export const fetchSourcesRequest = async (notebookId) => {
  if (IS_LOCAL) return getLocalSources(notebookId);

  const response = await fetch(`${API_URL}/source?notebookId=${notebookId}`, {
    method: "GET",
    headers: { ...getAuthHeader() },
  });

  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error("소스 목록을 불러오지 못했습니다.");

  return response.json();
};

export const uploadSourceRequest = async (notebookId, fileObject) => {
  if (!notebookId) {
    throw new Error("폴더 ID가 없습니다.");
  }

  if (!fileObject) {
    throw new Error("업로드할 파일이 없습니다.");
  }

  if (fileObject.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`);
  }

  if (IS_LOCAL) {
    const sources = getLocalSources(notebookId);

    const newSource = {
      id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: fileObject.name,
      size: fileObject.size,
      type: fileObject.type || "",
      lastModified: fileObject.lastModified || "",
      createdAt: new Date().toISOString(),
    };

saveLocalSources(notebookId, [...sources, newSource]);
    return newSource;
  }

  const formData = new FormData();
  formData.append("file", fileObject);
  formData.append("notebookId", notebookId);

  const response = await fetch(`${API_URL}/source/upload`, {
    method: "POST",
    headers: { ...getAuthHeader() },
    body: formData,
  });

  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error("파일 업로드에 실패했습니다.");

  return response.json();
};

export const fetchDocumentTextRequest = async (sourceId) => {
  if (IS_LOCAL) return "로컬 모드에서는 문서 텍스트를 불러올 수 없습니다.";

  const response = await fetch(`${API_URL}/source/${sourceId}/text`, {
    method: "GET",
    headers: { ...getAuthHeader() },
  });

  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error("문서 텍스트를 불러오지 못했습니다.");

  return response.text();
};