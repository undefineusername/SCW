'use client';

import { PhoneOff, Mic, MicOff, User, Video, VideoOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import type { CallType } from '@/hooks/use-group-call';

interface GroupCallOverlayProps {
    isOpen: boolean;
    callType: CallType;
    peers: Record<string, { stream: MediaStream | null; username?: string; avatar?: string; isSpeaking?: boolean }>;
    localStream: MediaStream | null;
    isMuted: boolean;
    isCameraOn: boolean;
    isLocalSpeaking?: boolean;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onLeave: () => void;
    isDark: boolean;
    groupName: string;
}

export default function GroupCallOverlay({
    isOpen,
    callType,
    peers,
    localStream,
    isMuted,
    isCameraOn,
    isLocalSpeaking,
    onToggleMute,
    onToggleCamera,
    onLeave,
    isDark,
    groupName
}: GroupCallOverlayProps) {
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        let timer: any;
        if (isOpen) {
            timer = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            setDuration(0);
        }
        return () => clearInterval(timer);
    }, [isOpen]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const participantCount = Object.keys(peers).length + (localStream ? 1 : 0);
    const isVoiceCall = callType === 'voice';

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-md text-white"
                >
                    {/* Header */}
                    <div className="p-6 flex justify-between items-center">
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
                            className="bg-red-500 hover:bg-red-600 p-4 rounded-full transition-colors shadow-lg shadow-red-500/20"
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

                    {/* Bottom Controls */}
                    <div className="p-10 flex justify-center gap-6">
                        <button
                            onClick={onToggleMute}
                            className={`p-5 rounded-full transition-all flex items-center justify-center ${isMuted
                                ? 'bg-red-500 text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                        >
                            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                        </button>

                        <button
                            onClick={onToggleCamera}
                            className={`p-5 rounded-full transition-all flex items-center justify-center ${!isCameraOn
                                ? 'bg-red-500 text-white'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                        >
                            {!isCameraOn ? <VideoOff size={28} /> : <Video size={28} />}
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function ParticipantCard({
    username,
    avatar,
    stream,
    isLocal,
    isMuted,
    isVideoOff,
    isSpeaking,
    isDark,
    _uuid,
    isVoiceCall
}: {
    username: string;
    avatar?: string;
    stream?: MediaStream | null;
    isLocal?: boolean;
    isMuted?: boolean;
    isVideoOff?: boolean;
    isSpeaking?: boolean;
    isDark: boolean;
    _uuid?: string;
    isVoiceCall: boolean;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);

            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                setHasRemoteVideo(videoTrack.enabled);
                const onEnabled = () => setHasRemoteVideo(true);
                const onDisabled = () => setHasRemoteVideo(false);
                videoTrack.addEventListener('mute', onDisabled);
                videoTrack.addEventListener('unmute', onEnabled);
                return () => {
                    videoTrack.removeEventListener('mute', onDisabled);
                    videoTrack.removeEventListener('unmute', onEnabled);
                };
            } else {
                setHasRemoteVideo(false);
            }
        }
    }, [stream]);

    const showPlaceholder = isVoiceCall || (isLocal ? isVideoOff : !hasRemoteVideo);

    return (
        <div
            data-peer-uuid={_uuid}
            className={`relative overflow-hidden flex flex-col items-center justify-center transition-all duration-500 ${isSpeaking ? 'ring-4 ring-green-500 shadow-2xl shadow-green-500/40 z-10 scale-[1.05]' : 'z-0'} ${isVoiceCall ? 'w-48 h-48 rounded-full border-2' : 'aspect-video rounded-3xl border'} ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-gray-800 border-gray-700'
                }`}>

            {/* Video Background */}
            {!showPlaceholder && stream && (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className={`absolute inset-0 w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
                />
            )}

            {/* Placeholder / Avatar */}
            {showPlaceholder && (
                <div className={`absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-gray-900/50 ${isVoiceCall ? '' : 'backdrop-blur-sm'}`}>
                    <div className={`rounded-full flex items-center justify-center text-4xl overflow-hidden relative transition-all duration-300 ${isSpeaking ? 'ring-4 ring-green-500 scale-110 shadow-lg shadow-green-500/20' : 'bg-gray-700'} ${isVoiceCall ? 'w-32 h-32' : 'w-24 h-24'}`}>
                        {avatar?.startsWith('data:image') ? (
                            <img src={avatar} alt={username} className="w-full h-full object-cover" />
                        ) : (
                            <User size={isVoiceCall ? 64 : 48} className="text-gray-500" />
                        )}

                        {/* Speaker Animation */}
                        {isSpeaking && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <motion.div
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                                    transition={{ repeat: Infinity, duration: 1 }}
                                    className="absolute w-full h-full bg-green-500/20 rounded-full"
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Overlays */}
            <div className={`absolute left-0 right-0 flex justify-center items-center pointer-events-none ${isVoiceCall ? 'bottom-4' : 'bottom-4 px-4 justify-between'}`}>
                <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2">
                    <p className="font-bold text-xs text-white truncate max-w-[100px]">{username}</p>
                    {isLocal && (
                        <span className="text-[8px] uppercase tracking-widest text-blue-400 font-bold bg-blue-400/10 px-1.5 py-0.5 rounded-full">
                            You
                        </span>
                    )}
                </div>

                {!isVoiceCall && isMuted && (
                    <div className="bg-red-500/80 backdrop-blur-md p-1.5 rounded-full">
                        <MicOff size={14} className="text-white" />
                    </div>
                )}
            </div>

            {/* In Voice call, show mute status centrally if needed, or overlay */}
            {isVoiceCall && isMuted && (
                <div className="absolute top-4 right-4 bg-red-500/80 backdrop-blur-md p-2 rounded-full">
                    <MicOff size={16} className="text-white" />
                </div>
            )}

            {/* Audio for remote peers */}
            {!isLocal && stream && (
                <audio
                    autoPlay
                    ref={(el) => {
                        if (el && stream) el.srcObject = stream;
                    }}
                    className="hidden"
                />
            )}
        </div>
    );
}

