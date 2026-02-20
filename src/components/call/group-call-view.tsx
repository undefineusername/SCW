'use client';

import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import ParticipantCard from './participant-card';

interface GroupCallViewProps {
    peers: Record<string, { stream: MediaStream | null; username?: string; avatar?: string; isSpeaking?: boolean }>;
    localStream: MediaStream | null;
    isMuted: boolean;
    isCameraOn: boolean;
    isLocalSpeaking?: boolean;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onLeave: () => void;
    isDark: boolean;
    duration: number;
    formatDuration: (s: number) => string;
    groupName: string;
    isVoiceCall: boolean;
}

export default function GroupCallView({
    peers,
    localStream,
    isMuted,
    isCameraOn,
    isLocalSpeaking,
    onToggleMute,
    onToggleCamera,
    onLeave,
    isDark,
    duration,
    formatDuration,
    groupName,
    isVoiceCall
}: GroupCallViewProps) {
    const participantCount = Object.keys(peers).length + (localStream ? 1 : 0);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 flex justify-between items-center z-10">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold">{groupName}</h2>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${isVoiceCall ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}`}>
                            {isVoiceCall ? 'Voice' : 'Video'} Call
                        </span>
                    </div>
                    <p className="text-sm text-gray-400">
                        {participantCount} Participants • {formatDuration(duration)}
                    </p>
                </div>
                <button
                    onClick={onLeave}
                    className="bg-red-500 hover:bg-red-600 p-4 rounded-full transition-colors shadow-lg shadow-red-500/20 active:scale-95"
                >
                    <PhoneOff size={24} />
                </button>
            </div>

            {/* Participants Content */}
            <div className={`flex-1 p-6 overflow-y-auto ${isVoiceCall ? 'flex flex-wrap items-center justify-center gap-12' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 content-start'}`}>
                {/* Local Participant */}
                <ParticipantCard
                    username="You"
                    isLocal
                    isMuted={isMuted}
                    isVideoOff={!isCameraOn}
                    isSpeaking={isLocalSpeaking}
                    isDark={isDark}
                    stream={localStream}
                    isVoiceCall={isVoiceCall}
                />

                {/* Remote Participants */}
                {Object.entries(peers).map(([uuid, peer]) => (
                    <ParticipantCard
                        key={uuid}
                        _uuid={uuid}
                        username={peer.username || 'Unknown'}
                        avatar={peer.avatar}
                        stream={peer.stream}
                        isSpeaking={peer.isSpeaking}
                        isDark={isDark}
                        isVoiceCall={isVoiceCall}
                    />
                ))}
            </div>

            {/* Bottom Controls (Grid View Style) */}
            <div className="p-10 flex justify-center gap-6 z-10">
                <button
                    onClick={onToggleMute}
                    className={`p-5 rounded-full transition-all flex items-center justify-center ${isMuted
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                        }`}
                >
                    {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                </button>

                <button
                    onClick={onToggleCamera}
                    className={`p-5 rounded-full transition-all flex items-center justify-center ${!isCameraOn
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                        }`}
                >
                    {!isCameraOn ? <VideoOff size={28} /> : <Video size={28} />}
                </button>
            </div>
        </div>
    );
}
