import { Plus, Search } from 'lucide-react';
import { db } from '@/lib/db';
import { getSocket } from '@/lib/socket';
import { useLiveQuery } from 'dexie-react-hooks';

interface FriendsListProps {
    isDark: boolean;
    currentUser: { uuid: string; username: string };
    onNewChat: (uuid: string) => void;
}

export default function FriendsList({ isDark, currentUser, onNewChat }: FriendsListProps) {
    const friends = useLiveQuery(() => db.friends.toArray()) || [];

    const handleAddFriend = () => {
        const username = prompt('Enter Username to find:');
        if (username && username.trim()) {
            const socket = getSocket();
            socket.emit('get_salt', username.trim());

            socket.once('salt_found', (data: { uuid: string }) => {
                alert(`User found: ${username}\nID: ${data.uuid}`);
                onNewChat(data.uuid);
            });

            socket.once('salt_not_found', () => {
                alert('User not found.');
                const directUuid = prompt('User not found by name. Enter UUID directly if you have it:');
                if (directUuid) onNewChat(directUuid.trim());
            });
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
                    <Plus size={20} />
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

                <div className="mx-5 h-px bg-gray-100 dark:bg-gray-800" />

                <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Contacts</span>
                        <span className="text-[11px] font-bold text-gray-400">{friends.length}</span>
                    </div>
                    <div className="space-y-1">
                        {friends.length === 0 ? (
                            <p className={`text-xs text-center py-12 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                Invite friends using their UUID<br />
                                to start a secure pipeline.
                            </p>
                        ) : (
                            friends.map(friend => (
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
