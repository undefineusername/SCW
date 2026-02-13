import { useState, useEffect, useCallback } from 'react';
import { getSocket, registerMaster } from '@/lib/socket';
import { db, type LocalMessage } from '@/lib/db';
import { encryptMessage, decryptMessage, deriveKeyFromSecret } from '@/lib/crypto';
import { useLiveQuery } from 'dexie-react-hooks';

export const DECRYPTION_ERROR_MSG = "[🔒 암호화된 메시지 - Key가 맞지 않음]";
export const NO_KEY_ERROR_MSG = "[🔒 암호화된 메시지 - Key가 설정되지 않음]";

export function useChat(
    user: { uuid: string; key: Uint8Array; username: string; salt?: string; kdfParams?: any } | null,
    selectedConversationUuid: string | null
) {
    const [isConnected, setIsConnected] = useState(false);
    const currentUserUuid = user?.uuid || null;
    const encryptionKey = user?.key || null;

    // Use Dexie's live query to automatically update UI on DB changes
    const conversations = useLiveQuery(() => db.conversations.toArray()) || [];

    useEffect(() => {
        if (!currentUserUuid || !encryptionKey) return;

        // Register as master with the relay server
        const socket = registerMaster({
            uuid: user!.uuid,
            username: user!.username,
            salt: user!.salt,
            kdfParams: user!.kdfParams
        });

        // Sync initial state
        setIsConnected(socket.connected);

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        // Handle incoming messages from the Transparent Pipeline Relay
        const onRawPush = async (data: { from: string; to: string; payload: any; timestamp: number; type?: string; msgId?: string }) => {
            const isEcho = data.type === 'echo' || data.from === currentUserUuid;

            try {
                let payloadBytes: Uint8Array;
                if (data.payload instanceof Uint8Array) {
                    payloadBytes = data.payload;
                } else if (Array.isArray(data.payload)) {
                    payloadBytes = new Uint8Array(data.payload);
                } else if (typeof data.payload === 'object' && data.payload.data) {
                    payloadBytes = new Uint8Array(data.payload.data);
                } else {
                    console.error('Unknown payload format:', data.payload);
                    return;
                }

                // Find active key for decryption
                let activeKey = encryptionKey;
                let conversationId = isEcho ? data.to : data.from;
                const conv = await db.conversations.get(conversationId);
                if (conv?.secret) {
                    activeKey = await deriveKeyFromSecret(conv.secret);
                }

                let text: string;
                try {
                    text = await decryptMessage(payloadBytes, activeKey);
                } catch (e) {
                    if (activeKey !== encryptionKey) {
                        try {
                            // Try fallback to master key if secret failed
                            text = await decryptMessage(payloadBytes, encryptionKey);
                        } catch (e2) {
                            text = DECRYPTION_ERROR_MSG;
                        }
                    } else {
                        text = NO_KEY_ERROR_MSG;
                    }
                }

                // Use msgId from data if available (e.g. from newer protocol), or generate one
                const msgId = data.msgId || `msg_${data.timestamp}_${data.from}`;

                const isCurrentChat = data.from === selectedConversationUuid;

                const message: LocalMessage = {
                    msgId,
                    from: data.from,
                    to: data.to,
                    text: text,
                    rawPayload: Array.from(payloadBytes), // Store as regular array for DB
                    timestamp: new Date(data.timestamp),
                    status: (isEcho || isCurrentChat) ? 'read' : 'sent',
                    isEcho
                };

                const exists = await db.messages.where('msgId').equals(msgId).first();
                if (!exists) {
                    await db.messages.add(message);
                    console.log(`📥 Message saved: ${msgId}`);
                }

                // Only send ACK if it's NOT an echo AND we are currently viewing this chat
                if (!isEcho && isCurrentChat) {
                    console.log(`📤 Sending ACK for ${msgId} to ${data.from} (Chat Active)`);
                    socket.emit('msg_ack', { to: data.from, msgId });
                }

                // Update conversation list
                conversationId = isEcho ? data.to : data.from;
                const existingConv = await db.conversations.get(conversationId);
                const convUpdate = {
                    lastMessage: text,
                    lastTimestamp: new Date(data.timestamp),
                    unreadCount: (!isEcho && !isCurrentChat) ? (existingConv?.unreadCount || 0) + 1 : 0
                };

                if (existingConv) {
                    await db.conversations.update(conversationId, convUpdate);
                } else if (!isEcho) {
                    await db.conversations.add({
                        id: conversationId,
                        username: `User-${conversationId.slice(0, 8)}`,
                        avatar: '👤',
                        ...convUpdate
                    });
                }
            } catch (err) {
                console.error('Failed to decrypt or save incoming message:', err);
            }
        };

        // Handle offline message queue flush
        const onQueueFlush = async (payloads: any[]) => {
            console.log(`📦 Received ${payloads.length} queued messages`);
            for (const payload of payloads) {
                await onRawPush(payload);
            }
        };

        // Handle dispatch status from server
        const onDispatchStatus = async ({ to, status }: { to: string; msgId: string; status: string }) => {
            console.log(`📡 Dispatch status to ${to}: ${status}`);
            const recentMsg = await db.messages
                .where('to').equals(to)
                .and(msg => msg.from === currentUserUuid)
                .reverse()
                .first();

            if (recentMsg) {
                if (status === 'delivered' || status === 'queued') {
                    await db.messages.update(recentMsg.id!, { status: 'sent' });
                } else if (status === 'dropped') {
                    await db.messages.update(recentMsg.id!, { status: 'failed' });
                }
            }
        };

        // Handle Read Receipts
        const onReadReceipts = async ({ from, msgId }: { from: string; msgId: string }) => {
            console.log(`📖 Received Read Receipt from ${from} for ${msgId}`);
            const msg = await db.messages.where('msgId').equals(msgId).first();
            if (msg && msg.id) {
                await db.messages.update(msg.id, { status: 'read' });
                console.log(`✅ Message ${msgId} status updated to READ`);
            } else {
                console.warn(`⚠️ Could not find message ${msgId} to update status`);
            }
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('relay_push', onRawPush);
        socket.on('queue_flush', onQueueFlush);
        socket.on('dispatch_status', onDispatchStatus);
        socket.on('msg_ack_push', onReadReceipts);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('relay_push', onRawPush);
            socket.off('queue_flush', onQueueFlush);
            socket.off('dispatch_status', onDispatchStatus);
            socket.off('msg_ack_push', onReadReceipts);
        };
    }, [user, selectedConversationUuid]);

    // NEW: Handle "Reading" existing messages when entering a chat
    useEffect(() => {
        if (!selectedConversationUuid || !currentUserUuid) return;

        const markAsRead = async () => {
            const unreadMessages = await db.messages
                .where('from').equals(selectedConversationUuid)
                .and(msg => msg.status !== 'read')
                .toArray();

            if (unreadMessages.length > 0) {
                const socket = getSocket();
                console.log(`📖 Marking ${unreadMessages.length} messages as READ in chat: ${selectedConversationUuid}`);

                for (const msg of unreadMessages) {
                    socket.emit('msg_ack', { to: selectedConversationUuid, msgId: msg.msgId });
                    await db.messages.update(msg.id!, { status: 'read' });
                }
            }
        };

        markAsRead();
    }, [selectedConversationUuid, currentUserUuid]);

    const sendMessage = useCallback(async (toUuid: string, text: string) => {
        if (!currentUserUuid || !encryptionKey) return;

        const socket = getSocket();
        const msgId = crypto.randomUUID();

        try {
            // Find active key for encryption
            let activeKey = encryptionKey;
            const conv = await db.conversations.get(toUuid);
            if (conv?.secret) {
                activeKey = await deriveKeyFromSecret(conv.secret);
            }

            const encryptedData = await encryptMessage(text, activeKey);

            // Convert Uint8Array to regular array
            const payloadArray = Array.from(encryptedData);

            // Save to local DB first (optimistic)
            await db.messages.add({
                msgId,
                from: currentUserUuid,
                to: toUuid,
                text,
                rawPayload: payloadArray,
                timestamp: new Date(),
                status: 'sending'
            });

            // Update conversation
            const existingConv = await db.conversations.get(toUuid);
            if (existingConv) {
                await db.conversations.update(toUuid, {
                    lastMessage: text,
                    lastTimestamp: new Date()
                });
            }

            // Send to relay using relay protocol
            socket.emit('relay', {
                to: toUuid,
                payload: payloadArray,
                msgId
            });

            return msgId;
        } catch (err) {
            console.error('Send message failed:', err);
            // Mark as failed
            await db.messages.where('msgId').equals(msgId).modify({ status: 'failed' });
        }
    }, [currentUserUuid, encryptionKey]);

    return { isConnected, conversations, sendMessage };
}
