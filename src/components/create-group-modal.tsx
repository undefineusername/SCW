import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    onCreateGroup: (name: string, participants: string[]) => void;
}

export default function CreateGroupModal({ isOpen, onClose, isDark, onCreateGroup }: CreateGroupModalProps) {
    const friends = useLiveQuery(() => db.friends.filter(f => !f.status || f.status === 'friend').toArray()) || [];
    const [groupName, setGroupName] = useState('');
    const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);

    const toggleParticipant = (uuid: string) => {
        setSelectedParticipants(prev =>
            prev.includes(uuid) ? prev.filter(id => id !== uuid) : [...prev, uuid]
        );
    };

    const handleCreate = () => {
        if (!groupName.trim()) {
            alert('그룹 이름을 입력해주세요.');
            return;
        }
        if (selectedParticipants.length < 1) {
            alert('최소 1명 이상의 참가자를 선택해주세요.');
            return;
        }
        onCreateGroup(groupName.trim(), selectedParticipants);
        setGroupName('');
        setSelectedParticipants([]);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className={`relative w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? 'bg-gray-900 border border-gray-800 text-white' : 'bg-white text-gray-900'
                            }`}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">새 그룹 채팅</h2>
                            <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                    그룹 이름
                                </label>
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={e => setGroupName(e.target.value)}
                                    placeholder="그룹 이름 입력..."
                                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none transition-all ${isDark
                                        ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-500'
                                        : 'bg-gray-50 border-gray-200 focus:bg-white focus:border-purple-500'
                                        }`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                    참가자 선택 ({selectedParticipants.length})
                                </label>
                                <div className={`max-h-60 overflow-y-auto rounded-xl border ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                                    {friends.length === 0 ? (
                                        <p className="p-4 text-center text-sm text-gray-500">대화할 친구가 없습니다.</p>
                                    ) : (
                                        friends.map(friend => (
                                            <div
                                                key={friend.uuid}
                                                onClick={() => toggleParticipant(friend.uuid)}
                                                className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${selectedParticipants.includes(friend.uuid)
                                                    ? (isDark ? 'bg-purple-500/10' : 'bg-purple-50')
                                                    : (isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50')
                                                    }`}
                                            >
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${isDark ? 'bg-gray-800' : 'bg-gray-200'
                                                    }`}>
                                                    {friend.avatar || '👤'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold truncate">{friend.username}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedParticipants.includes(friend.uuid)
                                                    ? 'bg-purple-500 border-purple-500'
                                                    : (isDark ? 'border-gray-700' : 'border-gray-300')
                                                    }`}>
                                                    {selectedParticipants.includes(friend.uuid) && <Check size={12} className="text-white" />}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={handleCreate}
                                className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-600 text-white font-bold shadow-lg hover:shadow-purple-500/20 transition-all active:scale-95"
                            >
                                그룹 만들기
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
