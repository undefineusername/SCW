'use client';

import { Phone, PhoneOff, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface IncomingCallDialogProps {
    isOpen: boolean;
    callerName: string;
    callerAvatar?: string;
    onAccept: () => void;
    onReject: () => void;
    isDark: boolean;
    callType: 'voice' | 'video';
}

export default function IncomingCallDialog({
    isOpen,
    callerName,
    callerAvatar,
    onAccept,
    onReject,
    isDark,
    callType
}: IncomingCallDialogProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden ${isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'
                            }`}
                    >
                        <div className="p-8 flex flex-col items-center text-center space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                                <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl overflow-hidden relative z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'
                                    }`}>
                                    {callerAvatar?.startsWith('data:image') ? (
                                        <img src={callerAvatar} alt={callerName} className="w-full h-full object-cover" />
                                    ) : (callerAvatar || '👤')}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <h3 className="text-xl font-bold">{callerName}</h3>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Incoming {callType === 'video' ? 'Video' : 'Voice'} Call...
                                </p>
                            </div>

                            <div className="flex gap-8 pt-4">
                                <button
                                    onClick={onReject}
                                    className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all shadow-lg shadow-red-500/30"
                                    title="Reject"
                                >
                                    <PhoneOff size={28} />
                                </button>
                                <button
                                    onClick={onAccept}
                                    className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 active:scale-90 transition-all shadow-lg shadow-green-500/30"
                                    title="Accept"
                                >
                                    {callType === 'video' ? <Video size={28} /> : <Phone size={28} />}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
