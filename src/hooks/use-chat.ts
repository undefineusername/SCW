import { useState, useEffect, useCallback } from 'react';
import { getSocket, registerMaster } from '@/lib/socket';
import { db, type LocalMessage } from '@/lib/db';
import {
    encryptMessage,
    decryptMessage,
    deriveKeyFromSecret,
    generateDHKeyPair,
    deriveSharedSecretFromRaw,
    deriveSharedSecret,
    exportPublicKeyToRaw
} from '@/lib/crypto';
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

    // Check/Generate DH Keys
    useEffect(() => {
        if (!currentUserUuid) return;

        const checkKeys = async () => {
            const account = await db.accounts.get(currentUserUuid);
            if (account && !account.dhPrivateKey) {
                console.log("🔑 Generating new DH Key Pair for", currentUserUuid);
                const keys = await generateDHKeyPair();
                await db.accounts.update(currentUserUuid, {
                    dhPrivateKey: keys.privateKey,
                    dhPublicKey: keys.publicKey
                });
                console.log("✅ DH Keys Generated and Saved.");
            }
        };
        checkKeys();
    }, [currentUserUuid]);

    useEffect(() => {
        if (!currentUserUuid || !encryptionKey) return;

        const initSocket = async () => {
            // Get latest account state for keys
            const account = await db.accounts.get(currentUserUuid);

            // Register as master with the relay server
            const socket = registerMaster({
                uuid: user!.uuid,
                username: user!.username,
                salt: user!.salt,
                kdfParams: user!.kdfParams,
                publicKey: account?.dhPublicKey // Send Public Key to Server!
            });

            // Sync initial state
            setIsConnected(socket.connected);

            const onConnect = () => setIsConnected(true);
            const onDisconnect = () => setIsConnected(false);

            // Handle incoming messages from the Transparent Pipeline Relay
            const onRawPush = async (data: { from: string; to: string; payload: any; timestamp: number; type?: string; msgId?: string }) => {
                const isEcho = data.type === 'echo' || data.from === currentUserUuid;

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

                    // --- Ultra Legend Protocol: Parser ---
                    // Format: [1 byte PubKeyLen][PubKeyBytes][EncryptedData]
                    // If classic format (no DH), it fails or assumes whole is encrypted.
                    // We detect by checking length byte? Or just try/catch?

                    // Simple Heuristic: If we can't derive a key, we assume it's legacy or error.
                    // But for this new version, let's assume all messages use the protocol.

                    let senderPubRaw: Uint8Array | null = null;
                    let encryptedBytes: Uint8Array = fullPayload;

                    // Check if we have prefix
                    // P-384 raw key is usually 97 bytes. 
                    const pubKeyLen = fullPayload[0];
                    if (pubKeyLen === 97 && fullPayload.length > 98) {
                        senderPubRaw = fullPayload.slice(1, 98);
                        encryptedBytes = fullPayload.slice(98);
                    }

                    let activeKey = encryptionKey;
                    let newSharedSecret: string | null = null;

                    // If we found a Public Key in payload, let's try to derive/update secret
                    if (senderPubRaw && !isEcho && account?.dhPrivateKey) {
                        try {
                            // Derive Shared Secret
                            newSharedSecret = await deriveSharedSecretFromRaw(account.dhPrivateKey, senderPubRaw);
                            console.log("🔐 Shared Secret Derived from Incoming Message PubKey (Pending Save)");
                        } catch (e) {
                            console.error("Failed to derive secret from payload key", e);
                        }
                    }

                    let conversationId = isEcho ? data.to : data.from;
                    const conv = await db.conversations.get(conversationId);

                    if (newSharedSecret) {
                        // Use the new secret if we just derived it
                        activeKey = await deriveKeyFromSecret(newSharedSecret);
                    } else if (conv?.secret) {
                        activeKey = await deriveKeyFromSecret(conv.secret);
                    }

                    let text: string;
                    try {
                        text = await decryptMessage(encryptedBytes, activeKey);
                    } catch (e) {
                        // Fallback logic for legacy messages or failed derivation
                        console.warn("Decryption failed, trying fallback...", e);
                        if (activeKey !== encryptionKey) {
                            try {
                                text = await decryptMessage(fullPayload, encryptionKey); // Try original payload
                            } catch (e2) {
                                text = DECRYPTION_ERROR_MSG;
                            }
                        } else {
                            text = NO_KEY_ERROR_MSG;
                        }
                    }

                    // --- System Message Handler ---
                    try {
                        // Attempt to parse as JSON to check for system messages
                        if (text.startsWith('{') && text.endsWith('}')) {
                            const payload = JSON.parse(text);
                            if (payload.system === true && payload.type) {
                                console.log(`⚙️ System Message Received: ${payload.type} from ${data.from}`);

                                if (payload.type === 'FRIEND_REQUEST') {
                                    // Received a Friend Request
                                    const existing = await db.friends.get(data.from);

                                    // Extract Public Key for saving
                                    const senderJWK = senderPubRaw ? await crypto.subtle.exportKey(
                                        'jwk',
                                        await crypto.subtle.importKey(
                                            'raw', senderPubRaw as any, { name: 'ECDH', namedCurve: 'P-384' }, true, []
                                        )
                                    ) as JsonWebKey : undefined;

                                    if (!existing) {
                                        await db.friends.add({
                                            uuid: data.from,
                                            username: payload.username || `User-${data.from.slice(0, 8)}`,
                                            isBlocked: false,
                                            status: 'pending_incoming',
                                            dhPublicKey: senderJWK
                                        });
                                    } else if (existing.status === 'pending_outgoing') {
                                        // Crossed requests - Auto accept
                                        await db.friends.update(data.from, { status: 'friend', dhPublicKey: senderJWK || existing.dhPublicKey });

                                        // Auto-accept means we can form a conversation too? 
                                        // Yes, if we crossed requests, we are effectively friends.
                                        if (newSharedSecret) {
                                            await db.conversations.put({
                                                id: data.from,
                                                username: existing.username,
                                                avatar: '👤',
                                                lastMessage: 'Friend Request Accepted', // System msg content
                                                lastTimestamp: new Date(),
                                                unreadCount: 0,
                                                secret: newSharedSecret
                                            });
                                        }
                                    } else {
                                        // Update key if existing friend request matches (e.g. re-sent)
                                        if (senderJWK) await db.friends.update(data.from, { dhPublicKey: senderJWK });
                                    }
                                    return; // Stop processing - don't add to messages
                                }
                                else if (payload.type === 'FRIEND_ACCEPT') {
                                    // Friend Request Accepted
                                    await db.friends.update(data.from, { status: 'friend' });

                                    // NOW we can save the conversation and secret
                                    if (newSharedSecret) {
                                        await db.conversations.put({
                                            id: data.from,
                                            username: payload.username || `User-${data.from.slice(0, 8)}`,
                                            avatar: '👤',
                                            lastMessage: 'Friend Request Accepted',
                                            lastTimestamp: new Date(),
                                            unreadCount: 0,
                                            secret: newSharedSecret
                                        });
                                    }
                                    return;
                                }
                                else if (payload.type === 'FRIEND_REJECT') {
                                    // Friend Request Rejected - remove or ignore
                                    await db.friends.delete(data.from);
                                    await db.conversations.delete(data.from); // Optional: delete conversation
                                    return;
                                }
                            }
                        }
                    } catch (e) {
                        // Not a JSON system message, ignore and treat as text
                        console.error("System message parse error", e);
                    }

                    // --- Normal Message Handling ---

                    // If we have a new secret and it's a valid normal message, SAVE IT NOW
                    if (newSharedSecret) {
                        await db.conversations.put({
                            id: data.from,
                            username: `User-${data.from.slice(0, 8)}`, // Fallback name, usually exists
                            avatar: '👤',
                            lastMessage: '', // will update below
                            lastTimestamp: new Date(),
                            unreadCount: 0,
                            secret: newSharedSecret
                        });
                        // Refresh conv object
                    }

                    // Use msgId from data if available (e.g. from newer protocol), or generate one
                    const msgId = data.msgId || `msg_${data.timestamp}_${data.from}`;

                    const isCurrentChat = data.from === selectedConversationUuid;

                    const message: LocalMessage = {
                        msgId,
                        from: data.from,
                        to: data.to,
                        text: text,
                        rawPayload: Array.from(fullPayload),
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
                    // Re-fetch conversation to ensure we have latest state (including secret if just saved)
                    const latestConv = await db.conversations.get(conversationId);

                    const convUpdate = {
                        lastMessage: text,
                        lastTimestamp: new Date(data.timestamp),
                        unreadCount: (!isEcho && !isCurrentChat) ? (latestConv?.unreadCount || 0) + 1 : 0
                    };

                    if (latestConv) {
                        await db.conversations.update(conversationId, convUpdate);
                    } else if (!isEcho) {
                        // Should have been created above if secret existed, but fallback
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
                }
            };

            socket.on('connect', onConnect);
            socket.on('disconnect', onDisconnect);
            socket.on('relay_push', onRawPush);
            socket.on('queue_flush', onQueueFlush);
            socket.on('dispatch_status', onDispatchStatus);
            socket.on('msg_ack_push', onReadReceipts);

            // Cleanup
            return () => {
                socket.off('connect', onConnect);
                socket.off('disconnect', onDisconnect);
                socket.off('relay_push', onRawPush);
                socket.off('queue_flush', onQueueFlush);
                socket.off('dispatch_status', onDispatchStatus);
                socket.off('msg_ack_push', onReadReceipts);
            };
        };

        const cleanupPromise = initSocket();

        return () => {
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };
    }, [user, selectedConversationUuid]);

    // NEW: Handle "Reading" existing messages when entering a chat (Keep existing logic)
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

            // Checks for Conversation Secret (Shared Key)
            const conv = await db.conversations.get(toUuid);
            if (conv?.secret) {
                activeKey = await deriveKeyFromSecret(conv.secret);
            } else {
                // If no secret, try to find in Friends list and DERIVE it now?
                // Or we can rely on protocol: Send my key, let them derive.
                // BUT I need a key to encrypt FOR THEM.
                // If I don't have their secret, I MUST use their Public Key to derive it first.
                // But I can only derive if I know their public key.
                const friend = await db.friends.get(toUuid);
                if (friend?.dhPublicKey) {
                    // We have their Public Key! Derive secret now.
                    const account = await db.accounts.get(currentUserUuid);
                    if (account?.dhPrivateKey) {
                        const sharedSecretStr = await deriveSharedSecret(account.dhPrivateKey, friend.dhPublicKey);

                        // Save it
                        await db.conversations.update(toUuid, { secret: sharedSecretStr });
                        activeKey = await deriveKeyFromSecret(sharedSecretStr);
                    }
                } else {
                    console.warn("⚠️ No Shared Secret and No Public Key for recipient. Falling back to encryptionKey (insecure/legacy).");
                    // In real E2EE, we should block this or fetch key from server.
                    // But for robustness:
                }
            }

            const encryptedData = await encryptMessage(text, activeKey);

            // --- Ultra Legend Protocol: Packing ---
            // [97 (len)][MyRawKey (97)][EncryptedData]

            let finalPayload = encryptedData;

            // Get My Public Key to attach
            const account = await db.accounts.get(currentUserUuid);
            if (account?.dhPublicKey) {
                const myRawPub = await exportPublicKeyToRaw(account.dhPublicKey);
                if (myRawPub.byteLength === 97) {
                    const packet = new Uint8Array(1 + myRawPub.byteLength + encryptedData.byteLength);
                    packet[0] = myRawPub.byteLength;
                    packet.set(myRawPub, 1);
                    packet.set(encryptedData, 1 + myRawPub.byteLength);
                    finalPayload = packet;
                }
            } else {
                // Fallback to sending just encrypted (will fail new parser check, fall to legacy)
            }

            // Convert Uint8Array to regular array
            const payloadArray = Array.from(finalPayload);

            // Check if it is a system message to avoid saving to DB
            let isSystemMessage = false;
            try {
                if (text.startsWith('{') && text.endsWith('}')) {
                    const payload = JSON.parse(text);
                    if (payload.system === true && payload.type && (payload.type.startsWith('FRIEND_'))) {
                        isSystemMessage = true;
                    }
                }
            } catch (e) { }

            // Save to local DB first (optimistic) - ONLY if NOT system message
            if (!isSystemMessage) {
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
            } else {
                console.log(`📤 Sending System Message: ${text}`);
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

