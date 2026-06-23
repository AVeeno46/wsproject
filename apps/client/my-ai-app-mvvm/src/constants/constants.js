// 앱 전역에서 쓰는 상수 모음.
// SERVER_URL을 실제 주소로 바꾸기 전까지는 IS_LOCAL=true가 되어,
// 각 model이 서버 대신 localStorage(목 데이터)로 동작합니다.

export const SERVER_URL = "서버_주소_작성"; // 실제 서버 주소로 교체하면 서버 모드로 전환됨
export const MAX_FILE_SIZE_MB = 50;          // 업로드 허용 최대 파일 크기(MB)
export const API_URL = `${SERVER_URL}/api`;  // 모든 API 요청의 기본 경로
export const IS_LOCAL = SERVER_URL === "서버_주소_작성"; // 서버 미연결(로컬 테스트) 여부