'use client';

import { PhoneOff, Mic, MicOff, Video, VideoOff, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import AudioStream from './audio-stream';

interface DirectCallViewProps {
    activeCall: any;
    peerData: { sessionId?: string; stream: MediaStream | null; username?: string; avatar?: string; isSpeaking?: boolean };
    localStream: MediaStream | null;
    isMuted: boolean;
    isCameraOn: boolean;
    isLocalSpeaking?: boolean;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onLeave: () => void;
    isDark: boolean;
    duration: number;
    elapsed: number;
    formatDuration: (s: number) => string;
    isVideoCall?: boolean;
}

export default function DirectCallView({
    activeCall,
    peerData,
    localStream,
    isMuted,
    isCameraOn,
    isLocalSpeaking,
    onToggleMute,
    onToggleCamera,
    onLeave,
    isDark,
    duration,
    elapsed,
    formatDuration,
    isVideoCall = true
}: DirectCallViewProps) {
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const sessionId = peerData.sessionId;
    const hasRemotePeer = !!sessionId && !!activeCall;
    const [hasRemoteVideo, setHasRemoteVideo] = useState(() => {
        return !!(peerData.stream?.getVideoTracks?.()?.[0]?.enabled);
    });

    // Stream SDK: bind video element so remote track is attached correctly (fixes "상대방 영상 안 보임")
    useEffect(() => {
        if (!activeCall || !sessionId || !remoteVideoRef.current) return;
        const cleanup = activeCall.bindVideoElement(remoteVideoRef.current, sessionId, 'videoTrack');
        return () => cleanup?.();
    }, [activeCall, sessionId]);

    // Fallback: also sync srcObject if stream is set (e.g. before bindVideoElement attaches)
    useEffect(() => {
        if (remoteVideoRef.current && peerData.stream && !hasRemotePeer) {
            remoteVideoRef.current.srcObject = peerData.stream;
            remoteVideoRef.current.play().catch(console.error);
        }
    }, [peerData.stream, hasRemotePeer]);

    useEffect(() => {
        const stream = peerData.stream;
        if (!stream?.getVideoTracks) return;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        const onEnabled = () => setHasRemoteVideo(true);
        const onDisabled = () => setHasRemoteVideo(false);
        if (hasRemoteVideo !== videoTrack.enabled) setHasRemoteVideo(videoTrack.enabled);
        videoTrack.addEventListener('mute', onDisabled);
        videoTrack.addEventListener('unmute', onEnabled);
        return () => {
            videoTrack.removeEventListener('mute', onDisabled);
            videoTrack.removeEventListener('unmute', onEnabled);
        };
    }, [peerData.stream]);

    useEffect(() => {
        if (localVideoRef.current && localStream && isCameraOn) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(console.error);
        }
    }, [localStream, isCameraOn]);

    return (
        <div className={`relative w-full h-full flex items-center justify-center overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
            {/* Remote Peer (Full Screen) */}
            <div className="absolute inset-0 z-0">
                {hasRemotePeer ? (
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center space-y-4 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-900'}`}>
                        <div className={`w-36 h-36 rounded-full flex items-center justify-center text-4xl overflow-hidden relative ${peerData.isSpeaking ? 'ring-4 ring-green-500 scale-110 shadow-lg shadow-green-500/20' : 'bg-gray-800'}`}>
                            {peerData.avatar?.startsWith('data:image') ? (
                                <img src={peerData.avatar} alt={peerData.username} className="w-full h-full object-cover" />
                            ) : (
                                <User size={64} className="text-gray-500" />
                            )}
                        </div>
                        <h2 className="text-3xl font-bold">
                            {peerData.username || (elapsed < 10 ? 'Ringing...' : elapsed < 30 ? 'No answer yet' : 'Call ended')}
                        </h2>
                        <p className="animate-pulse opacity-70">
                            {peerData.username ? `Call ${formatDuration(duration)}` : `Waiting... ${elapsed}s`}
                        </p>
                    </div>
                )}
            </div>

            {/* Overlays / Gradients */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent z-10 pointer-events-none" />

            {/* Header Info (only if video is on, otherwise centered above) */}
            {hasRemotePeer && (
                <div className="absolute top-6 left-6 z-20 text-white">
                    <h2 className="text-2xl font-bold shadow-black/50 drop-shadow-md">{peerData.username || 'Unknown'}</h2>
                    <p className="text-white/80 text-sm font-medium">{formatDuration(duration)}</p>
                </div>
            )}

            {/* Local Video (PIP) */}
            <motion.div
                className={`absolute top-6 right-6 z-30 w-32 aspect-[3/4] sm:w-48 sm:aspect-video rounded-2xl overflow-hidden shadow-2xl border-2 backdrop-blur-md transition-all ${isLocalSpeaking ? 'ring-4 ring-green-500 border-transparent' : 'border-white/20'
                    } ${isDark ? 'bg-black/50' : 'bg-white/50'}`}
                whileHover={{ scale: 1.05 }}
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
                {/* Simplified drag constraints for now, ideally would calculate window bounds */}
                {localStream && isCameraOn ? (
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-50">
                        <User size={32} className="text-gray-500" />
                    </div>
                )}
                {isMuted && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <MicOff size={24} className="text-red-500 drop-shadow-md" />
                    </div>
                )}
            </motion.div>

            {/* Bottom Controls */}
            <div className="absolute bottom-10 inset-x-0 z-40 flex justify-center gap-6">
                <button
                    type="button"
                    onClick={onToggleMute}
                    className={`p-5 rounded-full transition-all flex items-center justify-center backdrop-blur-md shadow-lg transform hover:scale-110 active:scale-95 ${isMuted
                        ? 'bg-white text-red-500'
                        : 'bg-white/20 hover:bg-white/30 text-white'
                        }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                </button>

                <button
                    type="button"
                    onClick={onLeave}
                    className="p-5 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transform hover:scale-110 active:scale-95 hover:bg-red-600 transition-all"
                    title="End call"
                >
                    <PhoneOff size={32} />
                </button>

                {isVideoCall && (
                    <button
                        type="button"
                        onClick={onToggleCamera}
                        className={`p-5 rounded-full transition-all flex items-center justify-center backdrop-blur-md shadow-lg transform hover:scale-110 active:scale-95 ${!isCameraOn
                            ? 'bg-white text-red-500'
                            : 'bg-white/20 hover:bg-white/30 text-white'
                            }`}
                        title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                    >
                        {!isCameraOn ? <VideoOff size={32} /> : <Video size={32} />}
                    </button>
                )}
            </div>

            {/* Audio for remote */}
            <AudioStream stream={peerData.stream} />
        </div>
    );
}
