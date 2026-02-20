import { useState, useEffect } from 'react';
import { X, Copy, QrCode, RefreshCw } from 'lucide-react';
import { getSocket } from '@/lib/socket';

interface AddFriendModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddFriend: (input: string) => void;
    isDark: boolean;
}

export default function AddFriendModal({ isOpen, onClose, onAddFriend, isDark }: AddFriendModalProps) {
    const [input, setInput] = useState('');
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const socket = getSocket();

        const onInviteCreated = (data: { code: string; expiresAt: number }) => {
            setInviteCode(data.code);
            // setExpiresAt(data.expiresAt); 
            setIsLoading(false);
        };

        socket.on('invite_code_created', onInviteCreated);

        return () => {
            socket.off('invite_code_created', onInviteCreated);
        };
    }, [isOpen]);

    const handleGenerateCode = () => {
        setIsLoading(true);
        getSocket().emit('create_invite_code');
    };

    if (!isOpen) return null;

    const qrUrl = inviteCode
        ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}?invite=${inviteCode}`)}&bgcolor=${isDark ? '1f2937' : 'ffffff'}&color=${isDark ? 'ffffff' : '000000'}&margin=10`
        : '';

    const handleCopyLink = () => {
        if (inviteCode) {
            const link = `${window.location.origin}?invite=${inviteCode}`;
            navigator.clipboard.writeText(link);
            alert('Invite Link Copied!');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className={`w-full max-w-md rounded-2xl shadow-2xl transform transition-all ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Add Friend</h2>
                    <button onClick={onClose} className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* Add Friend Section */}
                    <div className="space-y-3">
                        <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                            Find Friend
                        </label>
                        <div className="flex gap-2">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Enter Username or 6-digit Code"
                                className={`flex-1 px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 transition-all ${isDark
                                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
                            />
                            <button
                                onClick={() => {
                                    if (input.trim()) {
                                        onAddFriend(input.trim());
                                        // onClose(); 
                                    }
                                }}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-500/20"
                            >
                                Add
                            </button>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            Enter a username, UUID, or a 6-character Invite Code.
                        </p>
                    </div>

                    <div className={`h-px w-full ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

                    {/* My Invite Code Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                My Invite Code
                            </label>
                            {inviteCode && (
                                <span className={`text-[10px] font-mono ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    Expires in 24h
                                </span>
                            )}
                        </div>

                        {!inviteCode ? (
                            <div className={`text-center py-8 rounded-2xl border-2 border-dashed ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                                <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-400 shadow-sm'}`}>
                                    <QrCode size={24} />
                                </div>
                                <p className={`text-sm font-medium mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Generate a secure code to share via<br />QR or Link without exposing your UUID.
                                </p>
                                <button
                                    onClick={handleGenerateCode}
                                    disabled={isLoading}
                                    className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 mx-auto transition-all ${isLoading
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20'
                                        }`}
                                >
                                    <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                                    Generate Code
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 rounded-2xl flex flex-col items-center justify-center space-y-3 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                    <img src={qrUrl} alt="QR Code" className="w-32 h-32 rounded-lg mix-blend-multiply dark:mix-blend-normal dark:bg-white p-1" />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Scan to Add</span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <div className={`flex-1 rounded-2xl p-4 flex flex-col justify-center items-center text-center space-y-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                                        <div className={`text-3xl font-mono font-bold tracking-widest ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {inviteCode}
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>One-Time Code</span>
                                    </div>

                                    <button
                                        onClick={handleCopyLink}
                                        className={`p-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all w-full ${isDark
                                            ? 'bg-gray-700 hover:bg-gray-600 text-white'
                                            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}`}
                                    >
                                        <Copy size={16} />
                                        Copy Link
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
