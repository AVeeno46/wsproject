// [Model] 검색어(유사어) 사전 데이터 계층.
// 서버에 아직 이 개념 자체가 없어서(백엔드 확정 스펙 없음) 이 브라우저의
// localStorage에만 저장한다 — 다른 기기/브라우저에는 동기화되지 않는
// 클라이언트 전용 기능(설정 페이지의 프로필 이미지와 같은 방식).
// 같은 브라우저에서 여러 계정으로 로그인해도 사전이 섞이지 않도록 키를
// 계정별로 분리한다(구 공용 키 "synonymDictionary"는 첫 로드에서 이어받음).
import { getCurrentUserId } from "./modelUtils";

const LEGACY_STORAGE_KEY = "synonymDictionary";
const storageKey = () => `synonymDictionary:${getCurrentUserId()}`;

const DEFAULT_ITEMS = [
  { id: 1, keyword: "이수신청서", synonyms: "이수 신청서, 과정 신청서, 특별과정 신청서" },
  { id: 2, keyword: "우송비트", synonyms: "우송비트 고급과정, 고급특별과정, 비트과정" },
  { id: 3, keyword: "신청학점", synonyms: "학점, 취득학점" },
];

export const fetchSynonymsRequest = () => {
  try {
    const saved =
      localStorage.getItem(storageKey()) ??
      localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_ITEMS;
  } catch {
    return DEFAULT_ITEMS;
  }
};

export const saveSynonymsRequest = (items) => {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(items));
  } catch {
    // localStorage 사용 불가(용량 초과/시크릿 모드) 시 새로고침 후 초기화됩니다.
  }

  return items;
};
