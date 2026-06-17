import { useState } from 'react';
import { streamChatRequest } from '../models/chatModel';

export const useChatViewModel = (notebookId) => {
    const [chatHistory, setChatHistory] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState(null);

    const sendMessage = async (userQuery) => {
        if (!userQuery.trim()) return;

        setChatHistory((prev) => [...prev, { role: 'user', text: userQuery }]);
        setChatHistory((prev) => [...prev, { role: 'ai', text: '' }]);
        setIsThinking(true);

        let accumulated = '';

        try {
            await streamChatRequest(notebookId, userQuery, (chunk) => {
                accumulated += chunk;
                setIsThinking(false);
                setChatHistory((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'ai', text: accumulated };
                    return updated;
                });
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setIsThinking(false);
        }
    };


    return {
        chatHistory,
        isThinking,
        error,
        sendMessage,
    };
};
