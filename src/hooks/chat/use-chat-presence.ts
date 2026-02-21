import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export function useChatPresence(
    uuids: string | string[] | null,
    isConnected: boolean
) {
    useEffect(() => {
        if (!uuids || (Array.isArray(uuids) && uuids.length === 0) || !isConnected) return;

        const socket = getSocket();

        const checkPresence = () => {
            if (Array.isArray(uuids)) {
                // If the server supports array, great. If not, we might need to loop 
                // but usually array is better for performance if server is built for it.
                // Given the user wants "immediately", we'll send the whole list.
                socket.emit('get_presence', uuids);
            } else {
                socket.emit('get_presence', uuids);
            }
        };

        // Initial check
        checkPresence();

        // Periodic check every 30s (increased from 10s to avoid spamming for many friends)
        const interval = setInterval(checkPresence, 30000);

        return () => clearInterval(interval);
    }, [uuids, isConnected]);
}
