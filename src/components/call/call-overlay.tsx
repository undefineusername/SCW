'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { CallType } from '@/hooks/call/use-call';
import DirectCallView from './direct-call-view';
import GroupCallView from './group-call-view';

interface CallOverlayProps {
    activeCall: any;
    isOpen: boolean;
    callType: CallType;
    peers: Record<string, {
        sessionId?: string;
        stream: MediaStream | null;
        username?: string;
        avatar?: string;
        isSpeaking?: boolean;
        connectionState?: RTCPeerConnectionState;
        iceState?: RTCIceConnectionState;
    }>;
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

export default function CallOverlay({
    activeCall,
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
}: CallOverlayProps) {
    const [duration, setDuration] = useState(0);
    const [elapsed, setElapsed] = useState(0); // Always increments when call open (for "waiting" state)
    const hasConnectedPeer = Object.values(peers).some(p => p.connectionState === 'connected');

    useEffect(() => {
        let timer: any;
        if (isOpen) {
            timer = setInterval(() => {
                setElapsed((e) => e + 1);
                if (hasConnectedPeer) setDuration((d) => d + 1);
            }, 1000);
        } else {
            setDuration(0);
            setElapsed(0);
        }
        return () => clearInterval(timer);
    }, [isOpen, hasConnectedPeer]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const peerCount = Object.keys(peers).length;
    // Show Direct Call View if there is exactly 1 remote peer, or 0 (waiting state)
    // Actually, distinct 1:1 view is best when we have a specific peer.
    // If it's a "Group" call logic but only 2 people, treat as Direct.
    const isDirectCall = peerCount <= 1;

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black text-white"
                >
                    {isDirectCall ? (
                        <DirectCallView
                            activeCall={activeCall}
                            peerData={Object.values(peers)[0] || {}}
                            localStream={localStream}
                            isMuted={isMuted}
                            isCameraOn={isCameraOn}
                            isLocalSpeaking={isLocalSpeaking}
                            onToggleMute={onToggleMute}
                            onToggleCamera={onToggleCamera}
                            onLeave={onLeave}
                            isDark={isDark}
                            duration={duration}
                            elapsed={elapsed}
                            formatDuration={formatDuration}
                        />
                    ) : (
                        <GroupCallView
                            peers={peers}
                            localStream={localStream}
                            isMuted={isMuted}
                            isCameraOn={isCameraOn}
                            isLocalSpeaking={isLocalSpeaking}
                            onToggleMute={onToggleMute}
                            onToggleCamera={onToggleCamera}
                            onLeave={onLeave}
                            isDark={isDark}
                            duration={duration}
                            formatDuration={formatDuration}
                            groupName={groupName}
                            isVoiceCall={callType === 'voice'}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
