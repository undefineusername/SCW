'use client';

import { MicOff, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import AudioStream from './audio-stream';

interface ParticipantCardProps {
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
    connectionState?: RTCPeerConnectionState;
}

export default function ParticipantCard({
    username,
    avatar,
    stream,
    isLocal,
    isMuted,
    isVideoOff,
    isSpeaking,
    isDark,
    _uuid,
    isVoiceCall,
    connectionState
}: ParticipantCardProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(() => {
        return !!(stream?.getVideoTracks()[0]?.enabled);
    });

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);

            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                if (hasRemoteVideo !== videoTrack.enabled) {
                    setHasRemoteVideo(videoTrack.enabled);
                }
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
                    {!isLocal && connectionState && connectionState !== 'connected' && (
                        <span className={`text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full ${connectionState === 'connecting' ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
                            }`}>
                            {connectionState}
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

            {/* Audio for remote peers - Always render to ensure audio plays even if video is off */}
            {!isLocal && stream && (
                <AudioStream stream={stream} />
            )}
        </div>
    );
}
