import { useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { db } from '@/lib/db';
import {
    encryptMessage,
    deriveKeyFromSecret,
    deriveSharedSecret,
    exportPublicKeyToRaw
} from '@/lib/crypto';
import { getServerTime } from '@/lib/time';

export function useChatActions(
    currentUserUuid: string | null,
    encryptionKey: Uint8Array | null,
    user: { username: string; avatar?: string } | null
) {
    const sendMessage = useCallback(async (
        toUuid: string,
        text: string,
        replyTo?: { id: string; text: string; sender: string }
    ) => {
        if (!currentUserUuid || !encryptionKey) return;

        const socket = getSocket();
        const msgId = crypto.randomUUID();
        const timestamp = getServerTime().toISOString();

        try {
            const conv = await db.conversations.get(toUuid);
            const isGroup = conv?.isGroup && conv?.participants;
            const participants = isGroup ? conv.participants! : [toUuid];

            // 1. Determine if this is a system message (already JSON)
            let isSystem = false;
            try {
                if (text.trim().startsWith('{')) {
                    const parsed = JSON.parse(text);
                    if (parsed.system === true) isSystem = true;
                }
            } catch (e) { }

            // 2. Pack Payload
            let jsonPayload: string;
            if (isSystem) {
                // For system messages, automatically inject current user's profile info
                try {
                    const parsed = JSON.parse(text);
                    parsed.username = user!.username;
                    parsed.avatar = user!.avatar;
                    jsonPayload = JSON.stringify(parsed);
                } catch (e) {
                    jsonPayload = text;
                }
            } else {
                // For normal messages, wrap with metadata
                const payloadData: any = {
                    text,
                    timestamp,
                    groupId: isGroup ? toUuid : undefined,
                    groupName: isGroup ? conv?.username : undefined,
                    participants: isGroup ? participants : undefined
                };

                if (replyTo) {
                    payloadData.replyToId = replyTo.id;
                    payloadData.replyToText = replyTo.text;
                    payloadData.replyToSender = replyTo.sender;
                }
                jsonPayload = JSON.stringify(payloadData);
            }

            // Fan-out: Encrypt and send to each participant
            for (const participantUuid of participants) {
                if (participantUuid === currentUserUuid) continue;
                try {
                    let activeKey = encryptionKey;
                    const pConv = await db.conversations.get(participantUuid);

                    if (pConv?.secret) {
                        activeKey = await deriveKeyFromSecret(pConv.secret);
                    } else {
                        let friend = await db.friends.get(participantUuid);
                        if (friend?.dhPublicKey) {
                            let pubKey = friend.dhPublicKey;
                            if (typeof pubKey === 'string') {
                                try { pubKey = JSON.parse(pubKey); } catch (e) { }
                            }

                            const account = await db.accounts.get(currentUserUuid);
                            if (account?.dhPrivateKey) {
                                const sharedSecretStr = await deriveSharedSecret(account.dhPrivateKey, pubKey);
                                await db.conversations.update(participantUuid, { secret: sharedSecretStr });
                                activeKey = await deriveKeyFromSecret(sharedSecretStr);
                            }
                        }
                    }

                    const encryptedData = await encryptMessage(jsonPayload, activeKey);

                    // Attach My Public Key
                    let finalPayload = encryptedData;
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
                    }

                    socket.emit('relay', { to: participantUuid, payload: Array.from(finalPayload), msgId });
                } catch (err) {
                    console.error(`Failed to send to participant ${participantUuid}:`, err);
                }
            }

            // 3. Save to Local DB (Only if NOT a system message)
            if (!isSystem) {
                await db.messages.add({
                    msgId,
                    from: currentUserUuid,
                    to: toUuid,
                    text,
                    replyToSender: replyTo?.sender,
                    groupId: isGroup ? toUuid : undefined,
                    timestamp: getServerTime(),
                    status: 'sending'
                });

                if (toUuid !== currentUserUuid) {
                    await db.conversations.update(toUuid, {
                        lastMessage: text,
                        lastTimestamp: getServerTime()
                    });
                }
            }

            return msgId;
        } catch (err) {
            console.error('Send message failed:', err);
            await db.messages.where('msgId').equals(msgId).modify({ status: 'failed' });
        }
    }, [currentUserUuid, encryptionKey, user]);

    const markAsRead = useCallback(async (selectedConversationUuid: string) => {
        if (!selectedConversationUuid || !currentUserUuid) return;

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
    }, [currentUserUuid]);

    return { sendMessage, markAsRead };
}
