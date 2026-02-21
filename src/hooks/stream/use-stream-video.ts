import { useEffect, useState } from 'react';
import { StreamVideoClient, User } from '@stream-io/video-react-sdk';

export function useStreamVideo(apiKey: string | null, userUuid: string | null, token: string | null) {
    const [videoClient, setVideoClient] = useState<StreamVideoClient | null>(null);

    useEffect(() => {
        if (!apiKey || !userUuid || !token) return;

        const user: User = { id: userUuid };
        const client = new StreamVideoClient({ apiKey, user, token });

        setVideoClient(client);
        console.log('✅ [StreamVideo] Initialized for', userUuid);

        return () => {
            client.disconnectUser();
            setVideoClient(null);
        };
    }, [apiKey, userUuid, token]);

    return videoClient;
}
