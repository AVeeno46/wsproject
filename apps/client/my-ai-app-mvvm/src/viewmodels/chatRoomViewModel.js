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
    const createChatRoom = async (firstMessage) => {
        try {
            const newChatRoom = await createChatRoomRequest(firstMessage);
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
