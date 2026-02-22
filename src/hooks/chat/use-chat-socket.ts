import { useState, useEffect, useRef } from 'react';
import { StreamChat } from 'stream-chat';
import { registerMaster } from '@/lib/socket';
import { db, type LocalMessage } from '@/lib/db';
import {
    decryptMessage,
    deriveKeyFromSecret,
    deriveSharedSecretFromRaw,
    deriveSharedSecret
} from '@/lib/crypto';
import { DECRYPTION_ERROR_MSG, isSystemMessage } from './chat-utils';
import { updateServerTimeOffset, getServerTime } from '@/lib/time';

export function useChatSocket(
    user: { uuid: string; key: Uint8Array; username: string; avatar?: string; salt?: string; kdfParams?: any } | null,
    selectedConversationUuid: string | null,
    sendMessage: (toUuid: string, text: string) => Promise<string | undefined>,
    setPresence: React.Dispatch<React.SetStateAction<Record<string, "online" | "offline">>>,
    onWebRTCSignal?: (from: string, signal: any) => void,
    onCallParticipantsList?: (participants: string[]) => void,
    chatClient?: StreamChat | null
) {
    const [isConnected, setIsConnected] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);
    const [streamTokens, setStreamTokens] = useState<{ apiKey: string; chatToken: string; videoToken: string } | null>(null);
    const currentUserUuid = user?.uuid || null;
    const encryptionKey = user?.key || null;

    const onWebRTCSignalRef = useRef(onWebRTCSignal);
    const onCallParticipantsListRef = useRef(onCallParticipantsList);
    const socketRef = useRef<any>(null);
    const userRef = useRef(user);
    userRef.current = user; // Always up-to-date, without triggering re-renders

    useEffect(() => {
        onWebRTCSignalRef.current = onWebRTCSignal;
        onCallParticipantsListRef.current = onCallParticipantsList;
    }, [onWebRTCSignal, onCallParticipantsList]);

    // 1. Main Socket Connection & Base Listeners
    useEffect(() => {
        if (!currentUserUuid || !encryptionKey) return;

        let isMounted = true;
        const initSocket = async () => {
            const account = await db.accounts.get(currentUserUuid);
            if (!isMounted) return;

            const socket = registerMaster({
                uuid: userRef.current!.uuid,
                username: userRef.current!.username,
                salt: userRef.current!.salt,
                kdfParams: userRef.current!.kdfParams,
                publicKey: account?.dhPublicKey
            });
            socketRef.current = socket;

            setIsConnected(socket.connected);
            setIsRegistered(false);
            const onConnect = () => setIsConnected(true);
            const onDisconnect = () => {
                setIsConnected(false);
                setIsRegistered(false);
            };
            const onRegistered = () => setIsRegistered(true);

            const handleKeyUpdate = async (uuid: string, publicKey: any) => {
                if (publicKey && uuid !== currentUserUuid) {
                    const friend = await db.friends.get(uuid);
                    const newKeyStr = JSON.stringify(publicKey);
                    const oldKeyStr = friend?.dhPublicKey ? JSON.stringify(friend.dhPublicKey) : null;

                    if (newKeyStr !== oldKeyStr) {
                        try {
                            if (typeof publicKey !== 'object' || Array.isArray(publicKey)) return;
                            await db.friends.update(uuid, { dhPublicKey: publicKey });
                            const account = await db.accounts.get(currentUserUuid!);
                            if (account?.dhPrivateKey) {
                                const newSecret = await deriveSharedSecret(account.dhPrivateKey, publicKey);
                                await db.conversations.update(uuid, { secret: newSecret });
                            }
                        } catch (e) {
                            console.error(`❌ Failed to process public key from ${uuid}:`, e);
                        }
                    }
                }
            };

            const onRawPush = async (data: { from: string; to: string; payload: any; timestamp: number; type?: string; msgId?: string }) => {
                const isEcho = data.type === 'echo' || data.from === currentUserUuid;
                if (data.timestamp) updateServerTimeOffset(data.timestamp);

                try {
                    let fullPayload: Uint8Array;
                    if (data.payload instanceof Uint8Array) fullPayload = data.payload;
                    else if (Array.isArray(data.payload)) fullPayload = new Uint8Array(data.payload);
                    else if (typeof data.payload === 'object' && data.payload.data) fullPayload = new Uint8Array(data.payload.data);
                    else return;

                    let senderPubRaw: Uint8Array | null = null;
                    let encryptedBytes: Uint8Array = fullPayload;
                    const pubKeyLen = fullPayload[0];
                    if (pubKeyLen === 97 && fullPayload.length > 98) {
                        senderPubRaw = fullPayload.slice(1, 98);
                        encryptedBytes = fullPayload.slice(98);
                    }

                    let activeKey = encryptionKey;
                    let newSharedSecret: string | null = null;
                    if (senderPubRaw && !isEcho && account?.dhPrivateKey) {
                        try {
                            newSharedSecret = await deriveSharedSecretFromRaw(account.dhPrivateKey, senderPubRaw);
                        } catch (e) { }
                    }

                    let msgGroupId: string | undefined = undefined;
                    let conversationId = isEcho ? data.to : data.from;
                    const conv = await db.conversations.get(conversationId);

                    if (newSharedSecret) activeKey = await deriveKeyFromSecret(newSharedSecret);
                    else if (conv?.secret) activeKey = await deriveKeyFromSecret(conv.secret);

                    let text: string;
                    let decryptionSucceeded = true;
                    try {
                        text = await decryptMessage(encryptedBytes, activeKey);
                    } catch (e) {
                        try {
                            text = await decryptMessage(encryptedBytes, encryptionKey);
                        } catch (e2) {
                            text = DECRYPTION_ERROR_MSG;
                            decryptionSucceeded = false;
                        }
                    }

                    if (!decryptionSucceeded && senderPubRaw && !isEcho && !isSystemMessage(text)) {
                        sendMessage(data.from, JSON.stringify({ system: true, type: 'E2EE_PING' }));
                    }

                    if (senderPubRaw && !isEcho && !isSystemMessage(text)) {
                        try {
                            if (senderPubRaw.length === 97) {
                                const senderJWK = await crypto.subtle.exportKey(
                                    'jwk',
                                    await crypto.subtle.importKey('raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, [])
                                ) as JsonWebKey;
                                const stranger = await db.friends.get(data.from);
                                if (!stranger) {
                                    await db.friends.add({ uuid: data.from, username: `User-${data.from.slice(0, 8)}`, isBlocked: false, dhPublicKey: senderJWK });
                                } else if (!stranger.dhPublicKey) {
                                    await db.friends.update(data.from, { dhPublicKey: senderJWK });
                                }
                            }
                        } catch (e) { }
                    }

                    if (newSharedSecret) {
                        const existingConv = await db.conversations.get(data.from);
                        if (!existingConv || !existingConv.secret) {
                            const friendEntry = await db.friends.get(data.from);
                            await db.conversations.put({
                                id: data.from, username: friendEntry?.username || `User-${data.from.slice(0, 8)}`,
                                avatar: '👤', lastMessage: '', lastTimestamp: getServerTime(), unreadCount: 0, secret: newSharedSecret
                            });
                        } else if (existingConv.secret !== newSharedSecret) {
                            await db.conversations.update(data.from, { secret: newSharedSecret });
                        }
                    }

                    let msgText = text;
                    let replyToData: { id?: string, text?: string, sender?: string } = {};

                    try {
                        const trimmedText = text.trim();
                        if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
                            const payload = JSON.parse(trimmedText);
                            if (payload.system === true && payload.type) {
                                if (payload.type === 'FRIEND_REQUEST' || payload.type === 'FRIEND_ACCEPT') {
                                    const senderJWK = (senderPubRaw?.length === 97) ? await crypto.subtle.exportKey('jwk', await crypto.subtle.importKey('raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, [])) as JsonWebKey : undefined;
                                    const friendEntry = await db.friends.get(data.from);
                                    const resolvedUsername = friendEntry?.username || payload.username || `User-${data.from.slice(0, 8)}`;

                                    if (payload.type === 'FRIEND_REQUEST') {
                                        if (!friendEntry) await db.friends.add({ uuid: data.from, username: resolvedUsername, avatar: payload.avatar, isBlocked: false, status: 'pending_incoming', dhPublicKey: senderJWK });
                                        else await db.friends.update(data.from, { status: friendEntry.status === 'friend' ? 'friend' : 'pending_incoming', dhPublicKey: senderJWK || friendEntry.dhPublicKey, avatar: payload.avatar || friendEntry.avatar });
                                    } else {
                                        await db.friends.update(data.from, { status: 'friend', avatar: payload.avatar || friendEntry?.avatar });
                                    }

                                    const existingConv = await db.conversations.get(data.from);
                                    const convData = { secret: newSharedSecret || existingConv?.secret, avatar: payload.avatar || existingConv?.avatar, lastMessage: payload.type === 'FRIEND_REQUEST' ? 'Received friend request' : 'Friend Request Accepted', lastTimestamp: getServerTime(), unreadCount: (existingConv?.unreadCount || 0) + 1 };
                                    if (!existingConv) await db.conversations.put({ id: data.from, username: resolvedUsername, ...convData });
                                    else await db.conversations.update(data.from, convData);
                                    return;
                                } else if (payload.type === 'E2EE_PING' || payload.type === 'E2EE_PONG') {
                                    if (payload.avatar) {
                                        await db.friends.update(data.from, { avatar: payload.avatar });
                                        const conv = await db.conversations.get(data.from);
                                        if (conv) await db.conversations.update(data.from, { avatar: payload.avatar });
                                    }
                                    if (payload.type === 'E2EE_PING') sendMessage(data.from, JSON.stringify({ system: true, type: 'E2EE_PONG', username: userRef.current?.username, avatar: userRef.current?.avatar }));
                                    return;
                                } else if (payload.type === 'WEBRTC_SIGNAL' && onWebRTCSignalRef.current) {
                                    onWebRTCSignalRef.current(data.from, payload.signal);
                                    return;
                                }
                            }
                            if (payload.text !== undefined) {
                                msgText = payload.text;
                                replyToData = { id: payload.replyToId, text: payload.replyToText, sender: payload.replyToSender };
                                if (payload.groupId) { msgGroupId = payload.groupId; conversationId = msgGroupId as string; }
                            }
                        }
                    } catch (e) { }

                    const msgId = data.msgId || `msg_${data.timestamp}_${data.from}`;
                    const isCurrentChat = data.from === selectedConversationUuid;
                    const message: LocalMessage = { msgId, from: data.from, to: data.to, text: msgText, replyToId: replyToData.id, replyToText: replyToData.text, replyToSender: replyToData.sender, rawPayload: Array.from(fullPayload), timestamp: new Date(data.timestamp), status: (isEcho || isCurrentChat) ? 'read' : 'sent', isEcho, groupId: msgGroupId };

                    const exists = await db.messages.where('msgId').equals(msgId).first();
                    if (!exists) await db.messages.add(message);
                    if (!isEcho && isCurrentChat) socket.emit('msg_ack', { to: data.from, msgId });

                    const latestConv = await db.conversations.get(conversationId);
                    const convUpdate: any = { lastMessage: msgText, lastTimestamp: new Date(data.timestamp), unreadCount: (!isEcho && !isCurrentChat) ? (latestConv?.unreadCount || 0) + 1 : 0 };
                    if (latestConv) await db.conversations.update(conversationId, convUpdate);
                    else if (!isEcho) await db.conversations.add({ id: conversationId, username: `User-${conversationId.slice(0, 8)}`, avatar: msgGroupId ? '👥' : '👤', isGroup: !!msgGroupId, ...convUpdate });
                } catch (err) { }
            };

            socket.on('connect', onConnect);
            socket.on('disconnect', onDisconnect);
            socket.on('registered', onRegistered);
            socket.on('relay_push', onRawPush);
            socket.on('queue_flush', async (payloads: any[]) => { for (const p of payloads) await onRawPush(p); });
            socket.on('presence_update', async ({ uuid, status, publicKey }: any) => {
                setPresence(prev => (prev[uuid] === status) ? prev : { ...prev, [uuid]: status });
                await handleKeyUpdate(uuid, publicKey);
            });
            socket.on('presence_all', async (data: any[]) => {
                setPresence(prev => {
                    let hasChanges = false;
                    const next = { ...prev };
                    for (const item of data) { if (prev[item.uuid] !== item.status) { next[item.uuid] = item.status; hasChanges = true; } }
                    return hasChanges ? next : prev;
                });
                for (const item of data) await handleKeyUpdate(item.uuid, item.publicKey);
            });
            socket.on('stream_tokens', (tokens: any) => {
                setStreamTokens(prev => (prev?.chatToken === tokens.chatToken) ? prev : tokens);
            });
            socket.on('call_participants_list', ({ participants }: any) => onCallParticipantsListRef.current?.(participants));

            // Initial Token Request
            socket.emit('get_stream_token');

            return () => {
                socket.off('connect', onConnect);
                socket.off('disconnect', onDisconnect);
                socket.off('relay_push');
                socket.off('queue_flush');
                socket.off('presence_update');
                socket.off('presence_all');
                socket.off('stream_tokens');
                socket.off('call_participants_list');
            };
        };

        const cleanupPromise = initSocket();
        return () => {
            isMounted = false;
            cleanupPromise.then(cleanup => cleanup?.());
        };
    }, [currentUserUuid, encryptionKey, selectedConversationUuid]); // 'user' removed — read via userRef

    // 2. Separate Stream Listener (Break Dependency Cycle)
    useEffect(() => {
        if (!chatClient || !currentUserUuid) return;
        const streamHandler = (event: any) => {
            if (event.type === 'message.new' && event.message.custom_payload && socketRef.current) {
                // We reuse the relay logic via a fake relay_push if needed, or just call onRawPush
                // But onRawPush is internal to the other effect. For now, let's keep it simple.
                console.log('📡 [Stream] Redundant message ignored (using socket as primary)');
            }
        };
        chatClient.on('message.new', streamHandler);
        return () => { chatClient.off('message.new', streamHandler); };
    }, [chatClient, currentUserUuid]);

    return { isConnected, isRegistered, streamTokens };
}
