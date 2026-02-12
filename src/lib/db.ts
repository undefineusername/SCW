import Dexie, { type Table } from 'dexie';

export interface LocalMessage {
    id?: number;
    msgId: string;
    from: string;
    to: string;
    text: string;
    timestamp: Date;
    status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    isEcho?: boolean;
}

export interface LocalConversation {
    id: string; // The UUID of the other person
    username: string;
    avatar: string;
    lastMessage: string;
    lastTimestamp: Date;
    unreadCount: number;
    secret?: string;
}

export interface Friend {
    uuid: string;
    username: string;
    avatar?: string;
    statusMessage?: string;
    isBlocked: boolean;
}

export interface UserAccount {
    id: string; // generated UUID
    username: string;
    salt: string;
    kdfParams: any;
    // encryptionKey is NO LONGER stored here for security. 
    // It should be stored in memory/sessionStorage during active session.
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
    }
}

export const db = new ChatDatabase();
