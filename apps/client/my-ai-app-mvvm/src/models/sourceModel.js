// [Model] 소스(업로드 파일) 데이터 계층.
// 파일 목록 조회/업로드/삭제/다운로드를 담당합니다.
// IS_LOCAL이면 서버 대신 localStorage에 저장합니다.
import { API_URL, IS_LOCAL, MAX_FILE_SIZE_MB } from "../constants/constants";
import { apiFetch, getAuthHeader, handleUnauthorized } from "./modelUtils";

const FILE_BASE = `${API_URL}/file`;

const lsKey = (conversationId) => `local_sources_${conversationId}`;

const getLocalSources = (conversationId) => {
  try {
    return JSON.parse(localStorage.getItem(lsKey(conversationId)) || "[]");
  } catch {
    return [];
  }
};

const saveLocalSources = (conversationId, list) => {
  try {
    localStorage.setItem(lsKey(conversationId), JSON.stringify(list));
  } catch {
    // localStorage 사용 불가(용량 초과/시크릿 모드) 시 새로고침 후 초기화됩니다.
  }
};

// 서버 응답 필드(file_id, file_name)를 클라이언트 필드(id, name)로 변환
const toClient = (file) => ({
  id: String(file.file_id),
  name: file.file_name,
});

// 대시보드 카드의 "소스 개수" 계산용 — 삭제된 소스를 제외한 로컬 소스 수.
const getSourceKeysForCount = (source) => {
  if (!source) return [];

  const keys = [];
  const name = source.name || source.file?.name || "";
  const size = source.size || source.file?.size || 0;
  const lastModified = source.lastModified || source.file?.lastModified || "";

  if (name || size || lastModified) {
    keys.push(`${name}-${size}-${lastModified}`);
  }

  if (source.id) keys.push(String(source.id));

  return [...new Set(keys.filter(Boolean))];
};

export const getLocalSourceCount = (conversationId) => {
  try {
    const saved = localStorage.getItem(`local_sources_${conversationId}`);
    const deleted = localStorage.getItem(`deletedSources:${conversationId}`);

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

// GET /file/get-all/{dashboard_id} → [{ file_id, file_name }]
export const fetchSourcesRequest = async (conversationId) => {
  // [로컬]
  if (IS_LOCAL) return getLocalSources(conversationId);
  // [서버]
  const response = await apiFetch(`${FILE_BASE}/get-all/${conversationId}`, {
    method: "GET",
    headers: { ...getAuthHeader() },
  });

  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error("소스 목록을 불러오지 못했습니다.");

  const data = await response.json();
  return data.map(toClient);
};

// fail_reason 코드 → 에러 메시지
const FAIL_REASON_MESSAGES = {
  400: '파일명이 없습니다.',
  415: '지원하지 않는 확장자입니다.',
  422: '파일 데이터가 누락되었습니다.',
};

// POST /file/upload — multipart: dashboard_id(1회), file(복수 가능)
// file_name은 서버가 file에서 자동 추출하므로 별도 전송하지 않음
export const uploadSourceRequest = async (conversationId, fileObject) => {
  if (!conversationId) throw new Error("대화 ID가 없습니다.");
  if (!fileObject) throw new Error("업로드할 파일이 없습니다.");
  if (fileObject.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`);
  }

  // [로컬]
  if (IS_LOCAL) {
    const sources = getLocalSources(conversationId);
    const newSource = {
      id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: fileObject.name,
      size: fileObject.size,
      type: fileObject.type || "",
      lastModified: fileObject.lastModified || "",
      createdAt: new Date().toISOString(),
    };
    saveLocalSources(conversationId, [...sources, newSource]);
    return newSource;
  }

  // [서버]
  const formData = new FormData();
  formData.append('dashboard_id', String(conversationId));
  formData.append('file', fileObject);

  const response = await apiFetch(`${FILE_BASE}/upload`, {
    method: "POST",
    headers: { ...getAuthHeader() }, // Content-Type은 FormData가 boundary 포함해 자동 설정
    body: formData,
  });

  if (response.status === 401) return handleUnauthorized();
  if (response.status === 404) throw new Error('해당 대화에 소속되어 있지 않습니다.');
  if (response.status === 413) throw new Error(`파일 크기는 ${MAX_FILE_SIZE_MB}MB 이하여야 합니다.`);
  if (response.status === 415) throw new Error('지원하지 않는 확장자입니다.');
  if (response.status === 422) throw new Error('대화 ID 또는 데이터가 올바르지 않습니다.');
  if (!response.ok) throw new Error("파일 업로드에 실패했습니다.");

  const data = await response.json();
  // 서버 응답: [{ file_name, file_id, fail_reason }] 배열
  const item = Array.isArray(data) ? data[0] : data;
  if (item?.fail_reason && item.fail_reason !== 0) {
    throw new Error(FAIL_REASON_MESSAGES[item.fail_reason] || '파일 업로드에 실패했습니다.');
  }

  return { id: String(item?.file_id), name: item?.file_name || fileObject.name };
};

// DELETE /file/delete/{file_id}
export const deleteSourceRequest = async (conversationId, sourceId) => {
  // [로컬]
  if (IS_LOCAL) {
    const sources = getLocalSources(conversationId);
    saveLocalSources(conversationId, sources.filter((s) => String(s.id) !== String(sourceId)));
    return true;
  }
  // [서버]
  const response = await apiFetch(`${FILE_BASE}/delete/${sourceId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });
  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error('파일 삭제에 실패했습니다.');
  return true;
};

// GET /file/get/{file_id} → stream(arraybuffer)
// 소스의 실제 파일 바이트를 내려받아 ArrayBuffer로 합쳐 반환합니다.
export const downloadSourceRequest = async (sourceId) => {
  // [로컬] 미지원
  if (IS_LOCAL) return null;
  // [서버]
  const response = await apiFetch(`${FILE_BASE}/get/${sourceId}`, {
    method: "GET",
    headers: { ...getAuthHeader() },
  });

  if (response.status === 401) return handleUnauthorized();
  if (!response.ok) throw new Error("파일을 불러오지 못했습니다.");

  const fileName = response.headers.get('file_name') || '';

  // 서버가 stream으로 전송 → 청크 단위로 읽어서 하나의 ArrayBuffer로 합침
  const reader = response.body.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return { buffer: buffer.buffer, fileName };
};
