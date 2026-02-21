import { useState, useEffect } from 'react';
import { StreamChat } from 'stream-chat';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useChatKeys } from './use-chat-keys';
import { useChatPresence } from './use-chat-presence';
import { useChatActions } from './use-chat-actions';
import { useChatSocket } from './use-chat-socket';
export { DECRYPTION_ERROR_MSG, NO_KEY_ERROR_MSG } from './chat-utils';

export function useChat(
    user: { uuid: string; key: Uint8Array; username: string; avatar?: string; salt?: string; kdfParams?: any } | null,
    selectedConversationUuid: string | null,
    chatClient?: StreamChat | null,
    onWebRTCSignal?: (from: string, signal: any) => void,
    onCallParticipantsList?: (participants: string[]) => void
) {
    const currentUserUuid = user?.uuid || null;
    const encryptionKey = user?.key || null;

    // Presence State (Shared between Socket and Polling)
    const [presence, setPresence] = useState<Record<string, 'online' | 'offline'>>({});

    // Use Dexie's live query to automatically update UI on DB changes
    const conversations = useLiveQuery(() => db.conversations.toArray()) || [];
    const friends = useLiveQuery(() => db.friends.toArray()) || [];

    // 1. Actions (sendMessage, markAsRead)
    const { sendMessage, markAsRead } = useChatActions(currentUserUuid, encryptionKey, user, chatClient);

    // 2. Socket & Message Processing
    const { isConnected, streamTokens } = useChatSocket(
        user,
        selectedConversationUuid,
        sendMessage,
        setPresence,
        onWebRTCSignal,
        onCallParticipantsList,
        chatClient
    );

    // Collect all friend UUIDs for presence tracking
    const friendUuids = friends.map(f => f.uuid);
    // Include selected conversation if it's not a friend yet
    if (selectedConversationUuid && !friendUuids.includes(selectedConversationUuid)) {
        friendUuids.push(selectedConversationUuid);
    }

    // 3. Presence Polling (Track all friends + current)
    useChatPresence(friendUuids, isConnected);

    // 4. DH Key Management
    useChatKeys(currentUserUuid, isConnected, user);

    // 5. Auto-Mark as Read and Initial Handshake
    useEffect(() => {
        if (!selectedConversationUuid || !currentUserUuid) return;

        markAsRead(selectedConversationUuid);

        // Proactively send PING to sync avatar and keys when selecting a chat
        if (selectedConversationUuid && !conversations.find(c => c.id === selectedConversationUuid)?.isGroup) {
            sendMessage(selectedConversationUuid, JSON.stringify({
                system: true,
                type: 'E2EE_PING'
            }));
        }
    }, [selectedConversationUuid, currentUserUuid, markAsRead, sendMessage]);

    return { isConnected, conversations, sendMessage, presence, streamTokens };
}
