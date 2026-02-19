import { useState, useRef, useCallback } from 'react';

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

interface WebRTCSignal {
    type: 'offer' | 'answer' | 'candidate' | 'hangup' | 'reject';
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
}

export function useVoiceCall(_currentUserUuid: string | null, sendSignal: (to: string, signal: WebRTCSignal) => void) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [remotePeerUuid, setRemotePeerUuid] = useState<string | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const cleanup = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        setLocalStream(null);
        setRemoteStream(null);
        setCallState('idle');
        setRemotePeerUuid(null);
    }, []);

    const createPeerConnection = useCallback((targetUuid: string) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal(targetUuid, { type: 'candidate', candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                cleanup();
            }
        };

        pcRef.current = pc;
        return pc;
    }, [sendSignal, cleanup]);

    const startCall = useCallback(async (targetUuid: string) => {
        try {
            cleanup();
            setCallState('calling');
            setRemotePeerUuid(targetUuid);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = createPeerConnection(targetUuid);
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal(targetUuid, { type: 'offer', sdp: offer });
        } catch (err) {
            console.error('Failed to start call:', err);
            cleanup();
        }
    }, [createPeerConnection, sendSignal, cleanup]);

    const acceptCall = useCallback(async () => {
        if (!remotePeerUuid) return;

        try {
            setCallState('connected');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = pcRef.current;
            if (!pc) return;

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal(remotePeerUuid, { type: 'answer', sdp: answer });
        } catch (err) {
            console.error('Failed to accept call:', err);
            cleanup();
        }
    }, [remotePeerUuid, sendSignal, cleanup]);

    const rejectCall = useCallback(() => {
        if (remotePeerUuid) {
            sendSignal(remotePeerUuid, { type: 'reject' });
        }
        cleanup();
    }, [remotePeerUuid, sendSignal, cleanup]);

    const endCall = useCallback(() => {
        if (remotePeerUuid) {
            sendSignal(remotePeerUuid, { type: 'hangup' });
        }
        cleanup();
    }, [remotePeerUuid, sendSignal, cleanup]);

    const handleSignal = useCallback(async (from: string, signal: WebRTCSignal) => {
        if (signal.type === 'offer') {
            if (callState !== 'idle') {
                sendSignal(from, { type: 'reject' }); // Busy
                return;
            }
            setCallState('incoming');
            setRemotePeerUuid(from);

            const pc = createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
        } else if (signal.type === 'answer') {
            if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
                setCallState('connected');
            }
        } else if (signal.type === 'candidate') {
            if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate!));
            }
        } else if (signal.type === 'hangup' || signal.type === 'reject') {
            cleanup();
        }
    }, [callState, createPeerConnection, sendSignal, cleanup]);

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    }, [isMuted]);

    return {
        callState,
        remotePeerUuid,
        localStream,
        remoteStream,
        isMuted,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        handleSignal,
        toggleMute
    };
}
