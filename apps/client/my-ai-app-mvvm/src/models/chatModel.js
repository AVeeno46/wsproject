import { API_URL, IS_LOCAL } from '../constants/constants';
import { getAuthHeader, handleUnauthorized } from './modelUtils';

export const streamChatRequest = async (notebookId, question, onChunk) => {
    if (IS_LOCAL) {
        const reply = `[로컬 테스트] "${question}"에 대한 답변입니다. 서버 연결 후 실제 AI 응답이 표시됩니다.`;
        for (const char of reply) {
            await new Promise((res) => setTimeout(res, 20));
            onChunk(char);
        }
        return;
    }

    const response = await fetch(`${API_URL}/work-space/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ dashboard_id: notebookId, question }),
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
