import { useState, useEffect } from 'react';
import { Search, Edit2, CheckCircle2, Users, UserPlus } from 'lucide-react';
import { db } from '@/lib/db';
import { getSocket } from '@/lib/socket';
import { useLiveQuery } from 'dexie-react-hooks';
import AddFriendModal from './add-friend-modal';
import CreateGroupModal from './create-group-modal';

interface FriendsListProps {
    isDark: boolean;
    currentUser: { uuid: string; username: string };
    onNewChat: (uuid: string) => void;
    sendMessage: (to: string, text: string) => Promise<string | undefined>;
    pendingInviteCode?: string | null;
    onClearInvite?: () => void;
}

export default function FriendsList({ isDark, currentUser, onNewChat, sendMessage, pendingInviteCode, onClearInvite }: FriendsListProps) {
    const friends = useLiveQuery(() => db.friends.toArray()) || [];
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [editingUuid, setEditingUuid] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (pendingInviteCode && onClearInvite) {
            console.log("🔗 Processing Invite Code:", pendingInviteCode);
            handleAddFriendSubmit(pendingInviteCode);
            onClearInvite();
        }
    }, [pendingInviteCode]);

    const activeFriends = friends.filter(f => !f.status || f.status === 'friend');

    const handleFoundUser = async (data: { uuid: string; username?: string; publicKey?: any }) => {
        const username = data.username || `User-${data.uuid.slice(0, 8)}`; // Fallback
        const existing = await db.friends.get(data.uuid);

        if (existing) {
            if (existing.status === 'friend') {
                alert('Already friends!');
                return;
            } else if (existing.status === 'pending_outgoing') {
                alert('Request already sent!');
                return;
            } else if (existing.status === 'pending_incoming') {
                if (confirm(`User ${username} already sent you a request! Accept it?`)) {
                    handleAccept(data.uuid, username);
                }
                return;
            }
        }

        if (confirm(`User found: ${username}\nID: ${data.uuid}\n\nSend friend request?`)) {
            await db.friends.put({
                uuid: data.uuid,
                username: username,
                isBlocked: false,
                dhPublicKey: data.publicKey,
                status: 'pending_outgoing'
            });

            await sendMessage(data.uuid, JSON.stringify({
                system: true,
                type: 'FRIEND_REQUEST',
                username: currentUser.username
            }));

            alert('Friend request sent!');
            setIsAddModalOpen(false);
        }
    };

    const handleAddFriendSubmit = (input: string) => {
        const socket = getSocket();
        const isCode = /^[a-zA-Z0-9]{6}$/.test(input);

        if (isCode) {
            socket.emit('resolve_invite_code', input);
            socket.once('invite_code_resolved', (data: any) => {
                handleFoundUser(data);
                socket.off('invite_code_error');
            });
            socket.once('invite_code_error', (err: { message: string }) => {
                alert(`Invite Code Error: ${err.message}`);
                socket.off('invite_code_resolved');
            });
        } else {
            socket.emit('get_salt', input);
            socket.once('salt_found', (data: any) => {
                handleFoundUser({ ...data, username: input });
                socket.off('salt_not_found');
            });
            socket.once('salt_not_found', () => {
                if (input.length > 20) {
                    if (confirm(`User not found by name. Is '${input}' a UUID? Try adding directly?`)) {
                        handleFoundUser({ uuid: input, username: `User-${input.slice(0, 5)}...` });
                    }
                } else {
                    alert('User not found.');
                }
                socket.off('salt_found');
            });
        }
    };

    const handleAccept = async (uuid: string, username: string) => {
        await db.friends.update(uuid, { status: 'friend' });
        await sendMessage(uuid, JSON.stringify({
            system: true,
            type: 'FRIEND_ACCEPT',
            username: currentUser.username
        }));

        const exists = await db.conversations.get(uuid);
        if (!exists) {
            await db.conversations.add({
                id: uuid,
                username: username,
                avatar: '👤',
                lastMessage: 'Friend request accepted',
                lastTimestamp: new Date(),
                unreadCount: 0
            });
        }
    };


    const startEditing = (e: React.MouseEvent, uuid: string, currentName: string) => {
        e.stopPropagation();
        setEditingUuid(uuid);
        setEditName(currentName);
    };

    const saveRename = async (e: React.MouseEvent | React.FormEvent, uuid: string) => {
        e.stopPropagation();
        if (editName.trim()) {
            await db.friends.update(uuid, { username: editName.trim() });
            const conv = await db.conversations.get(uuid);
            if (conv) {
                await db.conversations.update(uuid, { username: editName.trim() });
            }
        }
        setEditingUuid(null);
    };

    const handleCreateGroup = async (name: string, participants: string[]) => {
        const groupId = `group_${crypto.randomUUID()}`;

        await db.conversations.add({
            id: groupId,
            username: name,
            avatar: '👥',
            lastMessage: 'Group created',
            lastTimestamp: new Date(),
            unreadCount: 0,
            isGroup: true,
            participants: [...participants, currentUser.uuid]
        });

        onNewChat(groupId);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <AddFriendModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onAddFriend={handleAddFriendSubmit}
                isDark={isDark}
            />
            <CreateGroupModal
                isOpen={isGroupModalOpen}
                onClose={() => setIsGroupModalOpen(false)}
                isDark={isDark}
                onCreateGroup={handleCreateGroup}
            />

            <div className="p-5 flex items-center justify-between flex-shrink-0">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Friends</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsGroupModalOpen(true)}
                        className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                        title="New Group Chat"
                    >
                        <Users size={20} />
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                        title="Add Friend"
                    >
                        <UserPlus size={20} />
                    </button>
                </div>
            </div>

            <div className="px-5 mb-4 flex-shrink-0">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <Search size={16} className="text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search"
                        className={`bg-transparent border-none focus:outline-none text-sm w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pb-6">
                <div className="px-5 py-5">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-100'}`}>
                            👤
                        </div>
                        <div className="flex-1">
                            <h3 className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{currentUser.username} (Me)</h3>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(currentUser.uuid);
                                    alert('UUID copied to clipboard!');
                                }}
                                className="text-[10px] text-gray-500 font-mono mt-0.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1"
                                title="Click to copy UUID"
                            >
                                ID: {currentUser.uuid.slice(0, 8)}... (Click to Copy)
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mx-5 h-px bg-gray-100 dark:bg-gray-800 mb-4" />

                <div className="mx-5 h-px bg-gray-100 dark:bg-gray-800 mb-4" />

                <div className="px-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Contacts</span>
                        <span className="text-[11px] font-bold text-gray-400">{activeFriends.length}</span>
                    </div>
                    <div className="space-y-1">
                        {activeFriends.length === 0 ? (
                            <p className={`text-xs text-center py-8 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                No friends yet.
                            </p>
                        ) : (
                            activeFriends.map(friend => (
                                <div
                                    key={friend.uuid}
                                    className={`group flex items-center gap-3 p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} cursor-pointer`}
                                    onClick={() => onNewChat(friend.uuid)}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                        {friend.avatar || '👤'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        {editingUuid === friend.uuid ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    className={`text-sm font-bold bg-transparent border-b border-purple-500 outline-none w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && saveRename(e as any, friend.uuid)}
                                                />
                                                <button onClick={e => saveRename(e, friend.uuid)} className="text-green-500">
                                                    <CheckCircle2 size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <p className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{friend.username}</p>
                                                    <p className="text-[9px] text-gray-500 font-mono opacity-60 truncate max-w-[150px]">{friend.uuid}</p>
                                                </div>
                                                <button
                                                    onClick={e => startEditing(e, friend.uuid, friend.username)}
                                                    className={`p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
