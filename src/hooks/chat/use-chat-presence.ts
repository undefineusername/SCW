import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export function useChatPresence(
    selectedConversationUuid: string | null,
    isConnected: boolean
) {
    useEffect(() => {
        if (!selectedConversationUuid || !isConnected) return;

        const socket = getSocket();

        // Initial check
        socket.emit('get_presence', selectedConversationUuid);

        // Periodic check every 10s
        const interval = setInterval(() => {
            socket.emit('get_presence', selectedConversationUuid);
        }, 10000);

        return () => clearInterval(interval);
    }, [selectedConversationUuid, isConnected]);
}
