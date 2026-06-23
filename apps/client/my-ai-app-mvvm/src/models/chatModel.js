// [Model] 채팅(AI 챗봇) 데이터 계층.
// 채팅 히스토리 조회와, AI 답변을 스트리밍으로 받아오는 요청을 담당합니다.
import { API_URL, IS_LOCAL } from '../constants/constants';
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

export const fetchChatHistoryRequest = async (notebookId) => {
    if (IS_LOCAL) return [];

    const response = await apiFetch(`${API_URL}/chat/history?notebookId=${notebookId}`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅 히스토리를 불러오지 못했습니다.');
    return response.json();
};

// AI 답변을 스트리밍으로 받아오며, 도착하는 조각마다 onChunk(text)를 호출합니다.
export const streamChatRequest = async (notebookId, query, onChunk) => {
    // [로컬 모드] 서버 없이 고정 문자열을 한 글자씩 흘려보내 스트리밍을 흉내냅니다.
    if (IS_LOCAL) {
        const reply = `[로컬 테스트] "${query}"에 대한 답변입니다. 서버 연결 후 실제 AI 응답이 표시됩니다.`;
        for (const char of reply) {
            await new Promise((res) => setTimeout(res, 20));
            onChunk(char);
        }
        return;
    }

    // [서버 모드] 실제 HTTP 스트림을 청크 단위로 읽어 SSE 포맷(data:)을 파싱합니다.

    const response = await apiFetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ notebookId, query }),
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅 요청에 실패했습니다.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop(); // 마지막 불완전한 줄은 다음 청크에서 처리

        for (const line of lines) {
            if (line.startsWith('data:')) {
                const text = line.slice(5).trim();
                if (text && text !== '[DONE]') onChunk(text);
            }
        }
    }
};
