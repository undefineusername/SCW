import { useEffect, useState } from 'react';
import { StreamChat } from 'stream-chat';

export function useStreamChat(apiKey: string | null, userUuid: string | null, token: string | null) {
    const [chatClient, setChatClient] = useState<StreamChat | null>(null);

    useEffect(() => {
        if (!apiKey || !userUuid || !token) return;

        const client = StreamChat.getInstance(apiKey);

        const connectUser = async () => {
            try {
                await client.connectUser(
                    { id: userUuid },
                    token
                );
                setChatClient(client);
                console.log('✅ [StreamChat] Connected as', userUuid);
            } catch (err) {
                console.error('❌ [StreamChat] Connection error:', err);
            }
        };

        connectUser();

        return () => {
            client.disconnectUser();
            setChatClient(null);
        };
    }, [apiKey, userUuid, token]);

    return chatClient;
}
