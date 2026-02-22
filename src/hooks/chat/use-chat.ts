import { useState, useEffect, useMemo, useRef } from 'react';
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

    // Use refs so we can call them in effects without adding to dependency arrays
    const sendMessageRef = useRef(sendMessage);
    const markAsReadRef = useRef(markAsRead);
    sendMessageRef.current = sendMessage;
    markAsReadRef.current = markAsRead;

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

    // Collect all friend UUIDs for presence tracking.
    // Use a stable comma-joined string so the array reference is only recreated when UUIDs actually change —
    // this prevents useLiveQuery's new-array-each-render from triggering useChatPresence repeatedly.
    const friendUuidsKey = useMemo(() => {
        const ids = friends.map(f => f.uuid).sort();
        if (selectedConversationUuid && !ids.includes(selectedConversationUuid)) {
            ids.push(selectedConversationUuid);
            ids.sort();
        }
        return ids.join(',');
    }, [friends, selectedConversationUuid]);

    const friendUuids = useMemo(
        () => (friendUuidsKey ? friendUuidsKey.split(',').filter(Boolean) : []),
        [friendUuidsKey]
    );

    // 3. Presence Polling
    useChatPresence(friendUuids, isConnected);

    // 4. DH Key Management
    useChatKeys(currentUserUuid, isConnected, user);

    // 5. Auto-Mark as Read and Initial E2EE Handshake
    // Refs are used so this only triggers on conversation/user change, not every sendMessage recreation
    useEffect(() => {
        if (!selectedConversationUuid || !currentUserUuid) return;

        markAsReadRef.current(selectedConversationUuid);

        const conv = conversations.find(c => c.id === selectedConversationUuid);
        if (!conv?.isGroup) {
            sendMessageRef.current(selectedConversationUuid, JSON.stringify({
                system: true,
                type: 'E2EE_PING'
            }));
        }
    }, [selectedConversationUuid, currentUserUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    return { isConnected, conversations, sendMessage, presence, streamTokens };
}
