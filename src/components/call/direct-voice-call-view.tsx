'use client';

import { PhoneOff, Mic, MicOff, User } from 'lucide-react';
import { useEffect, useRef } from 'react';
import AudioStream from './audio-stream';

interface DirectVoiceCallViewProps {
    peerData: { stream: MediaStream | null; username?: string; avatar?: string; isSpeaking?: boolean };
    isMuted: boolean;
    onToggleMute: () => void;
    onLeave: () => void;
    isDark: boolean;
    duration: number;
    elapsed: number;
    formatDuration: (s: number) => string;
}

export default function DirectVoiceCallView({
    peerData,
    isMuted,
    onToggleMute,
    onLeave,
    isDark,
    duration,
    elapsed,
    formatDuration
}: DirectVoiceCallViewProps) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && peerData.stream) {
            audioRef.current.srcObject = peerData.stream;
            audioRef.current.play().catch(console.error);
        }
    }, [peerData.stream]);

    return (
        <div className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden ${isDark ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-900'}`}>
            <AudioStream stream={peerData.stream} />

            <div className="flex flex-col items-center space-y-8 max-w-sm text-center px-6">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center text-5xl overflow-hidden border-4 ${peerData.isSpeaking ? 'border-green-500 ring-4 ring-green-500/30' : 'border-white/20'}`}>
                    {peerData.avatar?.startsWith('data:image') ? (
                        <img src={peerData.avatar} alt={peerData.username} className="w-full h-full object-cover" />
                    ) : (
                        peerData.avatar || <User size={64} className="text-gray-500" />
                    )}
                </div>
                <div>
                    <h2 className="text-2xl font-bold">{peerData.username || (elapsed < 10 ? 'Connecting...' : 'Voice Call')}</h2>
                    <p className={`mt-2 text-lg ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {peerData.username ? formatDuration(duration) : `${elapsed}s`}
                    </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                    Voice Call
                </span>
            </div>

            <div className="absolute bottom-16 inset-x-0 flex justify-center gap-8">
                <button
                    onClick={onToggleMute}
                    type="button"
                    className={`p-5 rounded-full transition-all flex items-center justify-center shadow-lg ${isMuted
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                        }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                </button>
                <button
                    onClick={onLeave}
                    type="button"
                    className="p-5 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600 active:scale-95 transition-all"
                    title="End call"
                >
                    <PhoneOff size={28} />
                </button>
            </div>
        </div>
    );
}
