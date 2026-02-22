import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

export function useChatPresence(
    uuids: string | string[] | null,
    isConnected: boolean
) {
    const lastUuidsRef = useRef<string>('');

    useEffect(() => {
        if (!uuids || (Array.isArray(uuids) && uuids.length === 0) || !isConnected) return;

        const currentStr = Array.isArray(uuids) ? [...uuids].sort().join(',') : (uuids as string);
        if (currentStr === lastUuidsRef.current) return;

        lastUuidsRef.current = currentStr;
        const socket = getSocket();

        const checkPresence = () => {
            if (socket.connected) {
                socket.emit('get_presence', uuids);
            }
        };

        // Initial check
        checkPresence();

        // Periodic check every 30s
        const interval = setInterval(checkPresence, 30000);

        return () => clearInterval(interval);
    }, [uuids, isConnected]);
}
