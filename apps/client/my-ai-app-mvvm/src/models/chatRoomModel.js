import { SERVER_URL, IS_LOCAL } from '../constants/constants';
// [Model] 채팅방(chatroom) 데이터 계층. (구 "대화"/notebook, dashboard 기반 API 폐기)
// 채팅방 목록 조회/생성/삭제/이름수정(CRUD)을 담당합니다.
// 가정 계약: docs/chatroom-api-contract.md
// IS_LOCAL이면 서버 대신 localStorage에 저장합니다.
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

const LS_KEY = 'local_chatrooms'; // 로컬 모드에서 채팅방 목록을 저장하는 키
const BASE = `${SERVER_URL}/chatroom`;

const getLocalChatRooms = () => {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch {
        return [];
    }
};

const saveLocalChatRooms = (list) => {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch {
        // localStorage 사용 불가(용량 초과/시크릿 모드) 시 새로고침 후 초기화됩니다.
    }
};

// 서버가 이름을 못 만들어 줄 때(로컬 모드)를 대비해, 첫 메시지 앞부분을 잘라
// 방 제목으로 쓴다 — 실제 서버는 자체 로직(요약/LLM 등)으로 이름을 생성한다.
const makeTitleFromMessage = (firstMessage, existingTitles) => {
    const trimmed = String(firstMessage || '').trim().replace(/\s+/g, ' ');
    const base = trimmed.slice(0, 20) || '새 대화';

    let title = base;
    for (let i = 2; existingTitles.has(title); i += 1) {
        title = `${base} ${i}`;
    }

    return title;
};

// 서버 응답 필드(chatroom_id, chatroom_name)를 클라이언트 필드(id, title)로 변환
const toClient = (room) => ({ id: String(room.chatroom_id), title: room.chatroom_name });

export const fetchChatRoomsRequest = async () => {
    // [로컬]
    if (IS_LOCAL) return getLocalChatRooms();
    // [서버]
    const response = await apiFetch(`${BASE}/get-all`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅방 목록을 불러오지 못했습니다.');
    const data = await response.json();
    return data.map(toClient);
};

// firstMessage를 같이 보내서, 서버가 그 내용을 바탕으로 채팅방 이름을 생성해 돌려준다.
// chatroom_id는 DB insert라 빠르지만 chatroom_name은 RAG 호출이 필요해 느리므로,
// 서버가 SSE로 두 이벤트를 나눠 보낸다(id 먼저, name 나중) — docs/chatroom-api-contract.md §2.
// onId(id)  — chatroom_id 이벤트가 오는 즉시 호출(호출자는 이 시점에 바로 화면 이동+dialogize 시작)
// onName(name) — chatroom_name 이벤트가 오는 즉시 호출(사이드바 제목만 갱신)
export const createChatRoomRequest = async (firstMessage, { onId, onName } = {}) => {
    // [로컬] 서버 SSE와 동일한 순서(id → name)로 콜백을 호출해 서버 모드와 같은 UX로 검증 가능
    if (IS_LOCAL) {
        const chatRooms = getLocalChatRooms();
        const existingTitles = new Set(chatRooms.map((n) => n.title.trim()));
        const id = Date.now().toString();
        onId?.(id);
        const title = makeTitleFromMessage(firstMessage, existingTitles);
        onName?.(title);
        const newChatRoom = { id, title, createdAt: new Date().toISOString() };
        saveLocalChatRooms([...chatRooms, newChatRoom]);
        return newChatRoom;
    }
    // [서버] SSE(data:) 스트림 — { chatroom_id } 이벤트 후 { chatroom_id, chatroom_name } 이벤트
    const response = await apiFetch(`${BASE}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ first_message: firstMessage }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅방 생성에 실패했습니다.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let chatroomId = null;
    let chatroomName = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch {
                continue;
            }

            if (parsed.chatroom_id != null && chatroomId == null) {
                chatroomId = parsed.chatroom_id;
                onId?.(String(chatroomId));
            }
            if (parsed.chatroom_name) {
                chatroomName = parsed.chatroom_name;
                onName?.(chatroomName);
            }
        }
    }

    if (chatroomId == null) throw new Error('채팅방 생성에 실패했습니다.');
    return { id: String(chatroomId), title: chatroomName || '' };
};

export const deleteChatRoomRequest = async (chatRoomId) => {
    // [로컬]
    if (IS_LOCAL) {
        const chatRooms = getLocalChatRooms();
        saveLocalChatRooms(chatRooms.filter((n) => n.id !== chatRoomId));
        return true;
    }
    // [서버]
    const response = await apiFetch(`${BASE}/delete/${chatRoomId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    return response.ok;
};

export const updateChatRoomTitleRequest = async (chatRoomId, title) => {
    // [로컬]
    if (IS_LOCAL) {
        const chatRooms = getLocalChatRooms();
        const updatedChatRooms = chatRooms.map((n) =>
            String(n.id) === String(chatRoomId)
                ? { ...n, title, updatedAt: new Date().toISOString() }
                : n
        );
        saveLocalChatRooms(updatedChatRooms);
        return updatedChatRooms.find((n) => String(n.id) === String(chatRoomId));
    }
    // [서버] 성공/실패는 상태 코드로만 판단 — 응답 바디(chatroom_name 등)는 필요
    // 없음(서버팀 확인). 보낸 title을 그대로 클라이언트 상태에 반영한다.
    // 경로는 update가 아니라 update-name — 실제 서버 컨트롤러 코드로 확인됨
    // (WorkspaceChatRoomController.cs의 [HttpPatch("update-name")]).
    const response = await apiFetch(`${BASE}/update-name`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ chatroom_id: Number(chatRoomId), chatroom_name: title }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (response.status === 404) throw new Error('채팅방을 찾을 수 없거나 수정 권한이 없습니다.');
    if (response.status === 409) throw new Error('같은 이름의 채팅방이 이미 있습니다.');
    if (response.status === 422) throw new Error('채팅방 이름 또는 ID가 올바르지 않습니다.');
    if (!response.ok) throw new Error('채팅방 이름 수정에 실패했습니다.');
    return { id: String(chatRoomId), title };
};
