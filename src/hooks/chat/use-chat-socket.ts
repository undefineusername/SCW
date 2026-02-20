import { useState, useEffect, useRef } from 'react';
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
    onCallParticipantsList?: (participants: string[]) => void
) {
    const [isConnected, setIsConnected] = useState(false);
    const currentUserUuid = user?.uuid || null;
    const encryptionKey = user?.key || null;

    const onWebRTCSignalRef = useRef(onWebRTCSignal);
    const onCallParticipantsListRef = useRef(onCallParticipantsList);

    useEffect(() => {
        onWebRTCSignalRef.current = onWebRTCSignal;
        onCallParticipantsListRef.current = onCallParticipantsList;
    }, [onWebRTCSignal, onCallParticipantsList]);

    useEffect(() => {
        if (!currentUserUuid || !encryptionKey) return;

        const initSocket = async () => {
            const account = await db.accounts.get(currentUserUuid);
            const socket = registerMaster({
                uuid: user!.uuid,
                username: user!.username,
                salt: user!.salt,
                kdfParams: user!.kdfParams,
                publicKey: account?.dhPublicKey
            });

            setIsConnected(socket.connected);
            const onConnect = () => setIsConnected(true);
            const onDisconnect = () => setIsConnected(false);

            const onRawPush = async (data: { from: string; to: string; payload: any; timestamp: number; type?: string; msgId?: string }) => {
                const isEcho = data.type === 'echo' || data.from === currentUserUuid;

                // Sync server time offset
                if (data.timestamp) {
                    updateServerTimeOffset(data.timestamp);
                }

                try {
                    let fullPayload: Uint8Array;
                    if (data.payload instanceof Uint8Array) {
                        fullPayload = data.payload;
                    } else if (Array.isArray(data.payload)) {
                        fullPayload = new Uint8Array(data.payload);
                    } else if (typeof data.payload === 'object' && data.payload.data) {
                        fullPayload = new Uint8Array(data.payload.data);
                    } else {
                        console.error('Unknown payload format:', data.payload);
                        return;
                    }

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
                        } catch (e) {
                            console.error("Failed to derive secret from payload key", e);
                        }
                    }

                    let msgGroupId: string | undefined = undefined;
                    let conversationId = isEcho ? data.to : data.from;
                    const conv = await db.conversations.get(conversationId);

                    if (newSharedSecret) {
                        activeKey = await deriveKeyFromSecret(newSharedSecret);
                    } else if (conv?.secret) {
                        activeKey = await deriveKeyFromSecret(conv.secret);
                    }

                    let text: string;
                    let decryptionSucceeded = true;
                    try {
                        text = await decryptMessage(encryptedBytes, activeKey);
                    } catch (e) {
                        try {
                            text = await decryptMessage(encryptedBytes, encryptionKey);
                        } catch (e2) {
                            try {
                                text = await decryptMessage(fullPayload, encryptionKey);
                            } catch (e3) {
                                text = DECRYPTION_ERROR_MSG;
                                decryptionSucceeded = false;
                            }
                        }
                    }

                    if (!decryptionSucceeded && senderPubRaw && !isEcho && !isSystemMessage(text)) {
                        console.log("🛠️ Decryption failed. Triggering force E2EE handshake...");
                        sendMessage(data.from, JSON.stringify({ system: true, type: 'E2EE_PING' }));
                    }

                    const stranger = await db.friends.get(data.from);
                    if (!stranger) {
                        const senderJWK = senderPubRaw ? await crypto.subtle.exportKey(
                            'jwk',
                            await crypto.subtle.importKey('raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, [])
                        ) as JsonWebKey : undefined;
                        await db.friends.add({
                            uuid: data.from,
                            username: `User-${data.from.slice(0, 8)}`,
                            isBlocked: false,
                            dhPublicKey: senderJWK
                        });
                    } else if (senderPubRaw && !stranger.dhPublicKey) {
                        const senderJWK = await crypto.subtle.exportKey(
                            'jwk',
                            await crypto.subtle.importKey('raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, [])
                        ) as JsonWebKey;
                        await db.friends.update(data.from, { dhPublicKey: senderJWK });
                    }

                    if (newSharedSecret) {
                        const existingConv = await db.conversations.get(data.from);
                        const friendEntry = await db.friends.get(data.from);
                        if (!existingConv || !existingConv.secret) {
                            await db.conversations.put({
                                id: data.from,
                                username: friendEntry?.username || `User-${data.from.slice(0, 8)}`,
                                avatar: '👤',
                                lastMessage: '',
                                lastTimestamp: getServerTime(),
                                unreadCount: 0,
                                secret: newSharedSecret
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
                                if (payload.type === 'FRIEND_REQUEST') {
                                    const existing = await db.friends.get(data.from);
                                    const senderJWK = senderPubRaw ? await crypto.subtle.exportKey(
                                        'jwk',
                                        await crypto.subtle.importKey('raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, [])
                                    ) as JsonWebKey : undefined;

                                    if (!existing) {
                                        await db.friends.add({
                                            uuid: data.from,
                                            username: payload.username || `User-${data.from.slice(0, 8)}`,
                                            avatar: payload.avatar,
                                            isBlocked: false,
                                            status: 'pending_incoming',
                                            dhPublicKey: senderJWK
                                        });
                                    } else if (existing.status === 'pending_outgoing') {
                                        await db.friends.update(data.from, {
                                            status: 'friend',
                                            dhPublicKey: senderJWK || existing.dhPublicKey,
                                            avatar: payload.avatar || existing.avatar
                                        });
                                    } else if (senderJWK || payload.avatar) {
                                        await db.friends.update(data.from, {
                                            dhPublicKey: senderJWK || existing?.dhPublicKey,
                                            avatar: payload.avatar || existing?.avatar
                                        });
                                    }

                                    if (newSharedSecret) {
                                        const existingConv = await db.conversations.get(data.from);
                                        const friendName = existing?.username || payload.username || `User-${data.from.slice(0, 8)}`;
                                        if (!existingConv) {
                                            await db.conversations.put({
                                                id: data.from,
                                                username: friendName,
                                                avatar: payload.avatar || '👤',
                                                lastMessage: '',
                                                lastTimestamp: getServerTime(),
                                                unreadCount: 0,
                                                secret: newSharedSecret
                                            });
                                        } else if (!existingConv.secret || payload.avatar) {
                                            await db.conversations.update(data.from, {
                                                secret: newSharedSecret || existingConv.secret,
                                                avatar: payload.avatar || existingConv.avatar
                                            });
                                        }
                                    }
                                    return;
                                } else if (payload.type === 'FRIEND_ACCEPT') {
                                    const friendEntry = await db.friends.get(data.from);
                                    const resolvedUsername = friendEntry?.username || payload.username || `User-${data.from.slice(0, 8)}`;
                                    await db.friends.update(data.from, {
                                        status: 'friend',
                                        avatar: payload.avatar || friendEntry?.avatar
                                    });

                                    if (newSharedSecret) {
                                        const existingConv = await db.conversations.get(data.from);
                                        if (!existingConv) {
                                            await db.conversations.put({
                                                id: data.from,
                                                username: resolvedUsername,
                                                avatar: payload.avatar || '👤',
                                                lastMessage: 'Friend Request Accepted',
                                                lastTimestamp: getServerTime(),
                                                unreadCount: 0,
                                                secret: newSharedSecret
                                            });
                                        } else {
                                            await db.conversations.update(data.from, {
                                                secret: newSharedSecret,
                                                avatar: payload.avatar || existingConv.avatar,
                                                lastMessage: 'Friend Request Accepted',
                                                lastTimestamp: getServerTime()
                                            });
                                        }
                                    }
                                    return;
                                } else if (payload.type === 'E2EE_PING' || payload.type === 'E2EE_PONG') {
                                    if (payload.avatar) {
                                        await db.friends.update(data.from, { avatar: payload.avatar });
                                        const conv = await db.conversations.get(data.from);
                                        if (conv) await db.conversations.update(data.from, { avatar: payload.avatar });
                                    }
                                    if (payload.type === 'E2EE_PING') {
                                        sendMessage(data.from, JSON.stringify({
                                            system: true,
                                            type: 'E2EE_PONG',
                                            username: user?.username,
                                            avatar: user?.avatar
                                        }));
                                    }
                                    return;
                                } else if (payload.type === 'FRIEND_REJECT') {
                                    await db.friends.delete(data.from);
                                    await db.conversations.delete(data.from);
                                    return;
                                } else if (payload.type === 'WEBRTC_SIGNAL') {
                                    if (onWebRTCSignalRef.current) {
                                        onWebRTCSignalRef.current(data.from, payload.signal);
                                    }
                                    return;
                                }
                            }

                            if (payload.text !== undefined) {
                                msgText = payload.text;
                                replyToData = { id: payload.replyToId, text: payload.replyToText, sender: payload.replyToSender };
                                if (payload.groupId) {
                                    msgGroupId = payload.groupId;
                                    conversationId = msgGroupId as string;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Payload parse error (assuming raw text):", e);
                    }

                    const msgId = data.msgId || `msg_${data.timestamp}_${data.from}`;
                    const isCurrentChat = data.from === selectedConversationUuid;

                    const message: LocalMessage = {
                        msgId, from: data.from, to: data.to, text: msgText,
                        replyToId: replyToData.id, replyToText: replyToData.text, replyToSender: replyToData.sender,
                        rawPayload: Array.from(fullPayload), timestamp: new Date(data.timestamp),
                        status: (isEcho || isCurrentChat) ? 'read' : 'sent', isEcho, groupId: msgGroupId
                    };

                    const exists = await db.messages.where('msgId').equals(msgId).first();
                    if (!exists) {
                        await db.messages.add(message);
                    }

                    if (!isEcho && isCurrentChat) {
                        socket.emit('msg_ack', { to: data.from, msgId });
                    }

                    const latestConv = await db.conversations.get(conversationId);
                    const convUpdate: any = {
                        lastMessage: msgText,
                        lastTimestamp: new Date(data.timestamp),
                        unreadCount: (!isEcho && !isCurrentChat) ? (latestConv?.unreadCount || 0) + 1 : 0
                    };

                    let payloadGroupName = null;
                    let payloadParticipants = null;
                    try {
                        const p = JSON.parse(text);
                        payloadGroupName = p.groupName;
                        payloadParticipants = p.participants;
                    } catch (e) { }

                    if (latestConv) {
                        if (msgGroupId) {
                            convUpdate.isGroup = true;
                            if (payloadParticipants) convUpdate.participants = payloadParticipants;
                            if (payloadGroupName) convUpdate.username = payloadGroupName;
                        }
                        await db.conversations.update(conversationId, convUpdate);
                    } else if (!isEcho) {
                        if (msgGroupId) {
                            await db.conversations.add({
                                id: conversationId,
                                username: payloadGroupName || `Group-${conversationId.slice(6, 14)}`,
                                avatar: '👥',
                                isGroup: true,
                                participants: payloadParticipants || [],
                                ...convUpdate
                            });
                        } else {
                            const friendEntry = await db.friends.get(conversationId);
                            await db.conversations.add({
                                id: conversationId,
                                username: friendEntry?.username || `User-${conversationId.slice(0, 8)}`,
                                avatar: '👤',
                                isGroup: false,
                                ...convUpdate
                            });
                        }
                    }
                } catch (err) {
                    console.error('Failed to decrypt or save incoming message:', err);
                }
            };

            const onQueueFlush = async (payloads: any[]) => {
                for (const payload of payloads) {
                    await onRawPush(payload);
                }
            };

            const onDispatchStatus = async ({ to, status }: { to: string; msgId: string; status: string }) => {
                const recentMsg = await db.messages.where('to').equals(to).and(msg => msg.from === currentUserUuid).reverse().first();
                if (recentMsg) {
                    if (status === 'delivered' || status === 'queued') await db.messages.update(recentMsg.id!, { status: 'sent' });
                    else if (status === 'dropped') await db.messages.update(recentMsg.id!, { status: 'failed' });
                }
            };

            const onReadReceipts = async ({ msgId }: { from: string; msgId: string }) => {
                const msg = await db.messages.where('msgId').equals(msgId).first();
                if (msg && msg.id) await db.messages.update(msg.id, { status: 'read' });
            };

            socket.on('connect', onConnect);
            socket.on('disconnect', onDisconnect);
            socket.on('relay_push', onRawPush);
            socket.on('queue_flush', onQueueFlush);
            socket.on('dispatch_status', onDispatchStatus);
            socket.on('msg_ack_push', onReadReceipts);

            socket.on('call_participants_list', ({ participants }: { participants: string[] }) => {
                if (onCallParticipantsListRef.current) {
                    onCallParticipantsListRef.current(participants);
                }
            });

            socket.on('presence_update', async ({ uuid, status, publicKey }: { uuid: string; status: 'online' | 'offline', publicKey?: any }) => {
                setPresence(prev => ({ ...prev, [uuid]: status }));
                if (publicKey && uuid !== currentUserUuid) {
                    const friend = await db.friends.get(uuid);
                    const newKeyStr = JSON.stringify(publicKey);
                    const oldKeyStr = friend?.dhPublicKey ? JSON.stringify(friend.dhPublicKey) : null;
                    if (newKeyStr !== oldKeyStr) {
                        await db.friends.update(uuid, { dhPublicKey: publicKey });
                        const account = await db.accounts.get(currentUserUuid!);
                        if (account?.dhPrivateKey) {
                            const newSecret = await deriveSharedSecret(account.dhPrivateKey, publicKey);
                            await db.conversations.update(uuid, { secret: newSecret });
                        }
                    }
                }
            });

            return () => {
                socket.off('connect', onConnect);
                socket.off('disconnect', onDisconnect);
                socket.off('relay_push', onRawPush);
                socket.off('queue_flush', onQueueFlush);
                socket.off('dispatch_status', onDispatchStatus);
                socket.off('msg_ack_push', onReadReceipts);
                socket.off('call_participants_list');
                socket.off('presence_update');
            };
        };

        const cleanupPromise = initSocket();
        return () => {
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };
    }, [user, selectedConversationUuid, sendMessage, setPresence, currentUserUuid, encryptionKey]);

    return { isConnected };
}
