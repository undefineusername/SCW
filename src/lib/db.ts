import Dexie, { type Table } from 'dexie';

export interface LocalMessage {
    id?: number;
    msgId: string;
    from: string;
    to: string;
    text: string;
    rawPayload?: number[]; // Store encrypted data for future re-decryption
    timestamp: Date;
    status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    isEcho?: boolean;
    // Reply System
    replyToId?: string;
    replyToText?: string;
    replyToSender?: string;
}

export interface LocalConversation {
    id: string; // The UUID of the other person
    username: string;
    avatar: string;
    lastMessage: string;
    lastTimestamp: Date;
    unreadCount: number;
    secret?: string;
    // Group Chat
    isGroup?: boolean;
    participants?: string[]; // Array of UUIDs
}

export interface Friend {
    uuid: string;
    username: string;
    avatar?: string;
    statusMessage?: string;
    isBlocked: boolean;
    dhPublicKey?: JsonWebKey;
    status?: 'friend' | 'pending_incoming' | 'pending_outgoing';
}

export interface UserAccount {
    id: string; // generated UUID
    username: string;
    salt: string;
    kdfParams: any;
    // DH Key Pair (ECDH P-384) - Stored mainly to regenerate session keys
    dhPrivateKey?: JsonWebKey;
    dhPublicKey?: JsonWebKey;
}

export class ChatDatabase extends Dexie {
    messages!: Table<LocalMessage>;
    conversations!: Table<LocalConversation>;
    accounts!: Table<UserAccount>;
    friends!: Table<Friend>;

    constructor() {
        super('ChatDB');
        this.version(2).stores({
            messages: '++id, msgId, from, to, timestamp, status',
            conversations: 'id, username, lastTimestamp',
            accounts: 'id, username',
            friends: 'uuid, username, isBlocked'
        });

        // Version 3: Add DH Keys
        this.version(3).stores({
            accounts: 'id, username', // Keys are just properties, not indexed
            friends: 'uuid, username, isBlocked'
        });

        // Version 5: Group Chats & Replies
        this.version(5).stores({
            messages: '++id, msgId, from, to, timestamp, status, replyToId',
            conversations: 'id, username, lastTimestamp, isGroup'
        });
    }
}

export const db = new ChatDatabase();
