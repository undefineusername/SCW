import { Search, Check, X, UserPlus, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { getSocket } from '@/lib/socket';
import { useLiveQuery } from 'dexie-react-hooks';

interface FriendsListProps {
    isDark: boolean;
    currentUser: { uuid: string; username: string };
    onNewChat: (uuid: string) => void;
    sendMessage: (to: string, text: string) => Promise<string | undefined>;
}

export default function FriendsList({ isDark, currentUser, onNewChat, sendMessage }: FriendsListProps) {
    const friends = useLiveQuery(() => db.friends.toArray()) || [];

    const activeFriends = friends.filter(f => !f.status || f.status === 'friend');
    const incomingRequests = friends.filter(f => f.status === 'pending_incoming');
    const outgoingRequests = friends.filter(f => f.status === 'pending_outgoing');

    const handleAddFriend = () => {
        const username = prompt('Enter Username to find:');
        if (username && username.trim()) {
            const socket = getSocket();
            socket.emit('get_salt', username.trim());

            socket.once('salt_found', async (data: { uuid: string; publicKey?: any }) => {
                const existing = await db.friends.get(data.uuid);

                if (existing) {
                    if (existing.status === 'friend') {
                        alert('Already friends!');
                        return;
                    } else if (existing.status === 'pending_outgoing') {
                        alert('Request already sent!');
                        return;
                    } else if (existing.status === 'pending_incoming') {
                        alert('User already sent you a request! Check your requests.');
                        return;
                    }
                }

                if (confirm(`User found: ${username}\nID: ${data.uuid}\n\nSend friend request?`)) {
                    // 1. Add to pending outgoing
                    await db.friends.put({
                        uuid: data.uuid,
                        username: username.trim(),
                        isBlocked: false,
                        dhPublicKey: data.publicKey, // Save the Public Key!
                        status: 'pending_outgoing'
                    });

                    // 2. Send Request Message
                    await sendMessage(data.uuid, JSON.stringify({
                        system: true,
                        type: 'FRIEND_REQUEST',
                        username: currentUser.username
                    }));

                    alert('Friend request sent!');
                }
            });

            socket.once('salt_not_found', () => {
                alert('User not found.');
                // Maybe allow raw UUID add here too?
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
        // Create conversation entry
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

    const handleReject = async (uuid: string) => {
        if (confirm('Reject this friend request?')) {
            await db.friends.delete(uuid);
            await sendMessage(uuid, JSON.stringify({
                system: true,
                type: 'FRIEND_REJECT',
                username: currentUser.username
            }));
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-5 flex items-center justify-between">
                <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Friends</h2>
                <button
                    onClick={handleAddFriend}
                    className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                >
                    <UserPlus size={20} />
                </button>
            </div>

            <div className="px-5 mb-4">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <Search size={16} className="text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search"
                        className={`bg-transparent border-none focus:outline-none text-sm w-full ${isDark ? 'text-white' : 'text-gray-900'}`}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Current User Profile Item */}
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

                {/* Friend Requests Section */}
                {incomingRequests.length > 0 && (
                    <div className="px-5 mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-blue-500 uppercase tracking-widest">Requests</span>
                            <span className="text-[11px] font-bold text-blue-500">{incomingRequests.length}</span>
                        </div>
                        <div className="space-y-2">
                            {incomingRequests.map(req => (
                                <div key={req.uuid} className={`p-3 rounded-xl flex items-center justify-between ${isDark ? 'bg-gray-800/50' : 'bg-blue-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isDark ? 'bg-gray-700' : 'bg-white'}`}>
                                            👤
                                        </div>
                                        <div>
                                            <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{req.username}</p>
                                            <p className="text-[9px] text-gray-500">Wants to be friends</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAccept(req.uuid, req.username)}
                                            className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                        >
                                            <Check size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleReject(req.uuid)}
                                            className={`p-1.5 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-200'} text-gray-500 rounded-lg transition-colors`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Outgoing Requests Section (Optional but good) */}
                {outgoingRequests.length > 0 && (
                    <div className="px-5 mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Sent</span>
                            <span className="text-[11px] font-bold text-gray-400">{outgoingRequests.length}</span>
                        </div>
                        <div className="space-y-1">
                            {outgoingRequests.map(req => (
                                <div key={req.uuid} className={`p-2 px-3 rounded-xl flex items-center justify-between opacity-70 ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
                                            <Clock size={12} />
                                        </div>
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{req.username}</span>
                                    </div>
                                    <span className="text-[9px] text-gray-400">Pending</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
                                <button
                                    key={friend.uuid}
                                    onClick={() => onNewChat(friend.uuid)}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                        {friend.avatar || '👤'}
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{friend.username}</p>
                                        <p className="text-[9px] text-gray-500 font-mono opacity-60 truncate max-w-[120px]">{friend.uuid}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
