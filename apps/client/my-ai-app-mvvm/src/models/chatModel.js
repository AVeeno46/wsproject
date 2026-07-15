// [Model] 채팅(AI 챗봇) 데이터 계층.
// 채팅 히스토리 조회와, AI 답변을 스트리밍으로 받아오는 요청을 담당합니다.
// 응답 청크 형식(3종)은 docs/chat-image-api-contract.md §2.1 계약을 따릅니다:
//   { type: "text", content }                        — 마크다운 답변 조각
//   { type: "edit_proposal", file_id, edits }        — AI 문서 편집 제안
//   { type: "source_ref", file_id, file_name }       — 답변이 참조한 문서
import { API_URL, IS_LOCAL } from '../constants/constants';
import { apiFetch, getAuthHeader, handleUnauthorized } from './modelUtils';

export const fetchChatHistoryRequest = async (conversationId) => {
    // [로컬] 히스토리 미지원
    if (IS_LOCAL) return [];
    // [서버] GET /workspace/chat/history/{chatroom_id}
    // (식별자 이름만 dashboard_id → chatroom_id로 변경 — docs/chatroom-api-contract.md §5)
    const response = await apiFetch(`${API_URL}/chat/history/${conversationId}`, {
        method: 'GET',
        headers: { ...getAuthHeader() },
    });
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅 히스토리를 불러오지 못했습니다.');
    return response.json();
};

// 서버가 보낸 data: 한 줄을 청크 객체로 변환.
// JSON이면 계약 형식({type,...})으로, JSON이 아니면(과거/단순 서버 호환) text 청크로 취급.
const parseChunk = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.type) return parsed;
    } catch {
        // JSON 아님 → 순수 텍스트 청크로 폴백
    }
    return { type: 'text', content: raw };
};

// AI 답변을 스트리밍으로 받아오며, 청크가 도착할 때마다 handlers 콜백을 호출합니다.
//   handlers.onText(content)           — 마크다운 텍스트 조각
//   handlers.onEditProposal(proposal)  — { file_id, edits } (선택)
//   handlers.onSourceRef(ref)          — { file_id, file_name } (선택)
//   signal                             — AbortController.signal (질문 취소용, 선택)
// 취소되면 AbortError를 조용히 삼키고 정상 반환합니다(부분 응답은 이미 콜백으로 전달됨).
export const streamChatRequest = async (conversationId, query, handlers, signal) => {
    // 하위 호환: 세 번째 인자가 함수면 onText 단일 콜백으로 취급
    const on = typeof handlers === 'function' ? { onText: handlers } : (handlers || {});
    const emit = (chunk) => {
        if (chunk.type === 'text') on.onText?.(chunk.content ?? '');
        else if (chunk.type === 'edit_proposal') on.onEditProposal?.(chunk);
        else if (chunk.type === 'source_ref') on.onSourceRef?.(chunk);
    };

    // [로컬] 서버 없이 고정 문자열을 한 글자씩 흘려보내 스트리밍을 흉내냅니다.
    // 마크다운 렌더링(표/코드블록/굵게 등) 확인용 예시를 포함합니다.
    if (IS_LOCAL) {
        const reply = [
            `[로컬 테스트] "${query}"에 대한 답변입니다. 서버 연결 후 실제 AI 응답이 표시됩니다.`,
            ``,
            `**마크다운 렌더링 테스트**`,
            ``,
            `| 항목 | 상태 |`,
            `| --- | --- |`,
            `| 표 렌더링 | ✅ |`,
            `| 코드블록 | ✅ |`,
            `| 이미지 | 서버 엔드포인트 필요 |`,
            ``,
            "```",
            `console.log("hello");`,
            "```",
        ].join("\n");

        for (const char of reply) {
            if (signal?.aborted) return; // 취소됨 — 남은 글자 중단
            await new Promise((res) => setTimeout(res, 8));
            emit({ type: 'text', content: char });
        }
        return;
    }

    // [서버] POST /workspace/chat/dialogize — SSE(data:) 스트림을 청크 단위로 파싱
    // (엔드포인트 이름만 chat/stream → chat/dialogize로 변경, 요청/응답 형식은 동일 — 서버팀 제안)
    // (요청 필드 dashboard_id → chatroom_id로 변경 — docs/chatroom-api-contract.md §5, 가정 계약)
    let response;
    try {
        response = await apiFetch(`${API_URL}/chat/dialogize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ chatroom_id: Number(conversationId), query }),
            signal,
        });
    } catch (e) {
        if (e.name === 'AbortError') return; // 사용자가 취소함
        throw e;
    }
    if (response.status === 401) return handleUnauthorized();
    if (!response.ok) throw new Error('채팅 요청에 실패했습니다.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop(); // 마지막 불완전한 줄은 다음 청크에서 처리

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const raw = line.slice(5).trim();
                    if (raw && raw !== '[DONE]') emit(parseChunk(raw));
                }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') return; // 스트림 도중 취소 — 부분 응답 유지
        throw e;
    }
};
