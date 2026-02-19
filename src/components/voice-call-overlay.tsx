'use client';

import { PhoneOff, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

import type { CallState } from '@/hooks/use-voice-call';

interface VoiceCallOverlayProps {
    callState: CallState;
    remoteName: string;
    remoteAvatar?: string;
    isMuted: boolean;
    onToggleMute: () => void;
    onEndCall: () => void;
    isDark: boolean;
    remoteStream: MediaStream | null;
}

export default function VoiceCallOverlay({
    callState,
    remoteName,
    remoteAvatar,
    isMuted,
    onToggleMute,
    onEndCall,
    isDark,
    remoteStream
}: VoiceCallOverlayProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        let timer: any;
        if (callState === 'connected') {
            timer = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            setDuration(0);
        }
        return () => clearInterval(timer);
    }, [callState]);

    useEffect(() => {
        if (audioRef.current && remoteStream) {
            console.log("🔊 Attaching remote stream to audio element");
            audioRef.current.srcObject = remoteStream;
            audioRef.current.play().catch(e => {
                console.error("❌ Audio playback failed:", e);
            });
        }
    }, [remoteStream]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <AnimatePresence>
            {callState !== 'idle' && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-6 right-6 z-50"
                >
                    <div className={`w-72 rounded-3xl shadow-2xl p-6 flex flex-col items-center space-y-4 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-100'
                        }`}>
                        <div className="flex items-center gap-4 w-full">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-100'
                                }`}>
                                {remoteAvatar?.startsWith('data:image') ? (
                                    <img src={remoteAvatar} alt={remoteName} className="w-full h-full object-cover" />
                                ) : (remoteAvatar || '👤')}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{remoteName}</p>
                                <p className="text-[11px] text-blue-500 font-bold uppercase tracking-wider">
                                    {callState === 'calling' ? 'Calling...' : formatDuration(duration)}
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4 w-full pt-2">
                            <button
                                onClick={onToggleMute}
                                className={`flex-1 h-12 rounded-2xl flex items-center justify-center transition-all ${isMuted
                                    ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                                    : isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                            >
                                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                            </button>
                            <button
                                onClick={onEndCall}
                                className="flex-1 h-12 rounded-2xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all"
                            >
                                <PhoneOff size={20} />
                            </button>
                        </div>

                        {/* Hidden audio element for remote stream */}
                        <audio ref={audioRef} autoPlay />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
