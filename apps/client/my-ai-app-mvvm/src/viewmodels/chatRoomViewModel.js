// [ViewModel] 채팅방(chatroom) 목록 화면의 상태와 로직을 담는 hook.
// 채팅방 목록 로딩/생성/삭제/제목수정을 처리하고 loading·error 상태를 관리합니다.
import { useState, useEffect } from 'react';
import {
    fetchChatRoomsRequest,
    createChatRoomRequest,
    deleteChatRoomRequest,
    updateChatRoomTitleRequest,
} from '../models/chatRoomModel';

export const useChatRoomViewModel = () => {
    const [chatRooms, setChatRooms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchChatRooms = async () => {
        setLoading(true);
        try {
            const data = await fetchChatRoomsRequest();
            setChatRooms(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // firstMessage를 같이 보내면 서버가 그 내용을 바탕으로 방 이름을 지어서 돌려준다
    // (사용자가 직접 이름을 짓지 않음 — docs/chatroom-api-contract.md §2).
    // chatroom_id는 빠르고 chatroom_name은 느리므로(SSE 이원화), id를 받는 즉시
    // onId로 알려서 호출자가 이름을 기다리지 않고 화면 이동/dialogize를 시작할 수 있게 한다.
    const createChatRoom = async (firstMessage, { onId } = {}) => {
        let createdId = null;
        try {
            const newChatRoom = await createChatRoomRequest(firstMessage, {
                onId: (id) => {
                    createdId = id;
                    // 이름이 오기 전에도 사이드바에 방이 바로 보이도록 임시 항목을 추가
                    setChatRooms((prev) => [...prev, { id, title: '' }]);
                    onId?.(id);
                },
                onName: (name) => {
                    setChatRooms((prev) =>
                        prev.map((room) =>
                            String(room.id) === String(createdId) ? { ...room, title: name } : room
                        )
                    );
                },
            });
            // 서버 기준으로 최종 동기화(로컬 낙관적 갱신과 어긋나는 부분 보정)
            await fetchChatRooms();
            return newChatRoom;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const removeChatRoom = async (chatRoomId) => {
        try {
            const success = await deleteChatRoomRequest(chatRoomId);
            if (success) {
                setChatRooms((prev) => prev.filter((n) => n.id !== chatRoomId));
            } else {
                const err = new Error('삭제에 실패했습니다.');
                setError(err.message);
                throw err;
            }
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    const updateChatRoomTitle = async (chatRoomId, title) => {
        const trimmed = title.trim().toLowerCase();
        const isDuplicate = chatRooms.some(
            (n) => String(n.id) !== String(chatRoomId) && n.title.trim().toLowerCase() === trimmed
        );
        if (isDuplicate) {
            const err = new Error('같은 이름의 채팅방이 이미 있습니다.');
            setError(err.message);
            throw err;
        }
        try {
            const updatedChatRoom = await updateChatRoomTitleRequest(chatRoomId, title);

            setChatRooms((prev) =>
                prev.map((room) =>
                    String(room.id) === String(chatRoomId)
                        ? { ...room, title: updatedChatRoom?.title || title }
                        : room
                )
            );

            return updatedChatRoom;
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    // 마운트 시 채팅방 목록을 서버(또는 로컬)에서 가져오는 데이터 페칭 effect —
    // 정당한 자리(React "Fetching data" 패턴).
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchChatRooms();
    }, []);

    const clearError = () => setError(null);

    return {
        chatRooms,
        loading,
        error,
        clearError,
        createChatRoom,
        removeChatRoom,
        updateChatRoomTitle,
        refresh: fetchChatRooms,
    };
};
