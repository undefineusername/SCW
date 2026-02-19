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
    const candidateQueue = useRef<RTCIceCandidateInit[]>([]);

    const cleanup = useCallback(() => {
        console.log("🧹 Cleaning up WebRTC...");
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        candidateQueue.current = [];
        setLocalStream(null);
        setRemoteStream(null);
        setCallState('idle');
        setRemotePeerUuid(null);
    }, []);

    const createPeerConnection = useCallback((targetUuid: string) => {
        console.log(`🏗️ Creating PeerConnection for ${targetUuid}`);
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
            ]
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("📡 Sending ICE candidate");
                sendSignal(targetUuid, { type: 'candidate', candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log("🎵 Remote track received:", event.track.kind);
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            } else {
                console.log("⚠️ No remote stream found, creating one for track");
                setRemoteStream(new MediaStream([event.track]));
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("🌐 ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
                cleanup();
            }
        };

        pc.onsignalingstatechange = () => {
            console.log("🚦 Signaling State:", pc.signalingState);
        };

        pcRef.current = pc;
        return pc;
    }, [sendSignal, cleanup]);

    const processCandidateQueue = useCallback(async () => {
        if (!pcRef.current || !pcRef.current.remoteDescription) return;
        console.log(`📦 Processing ${candidateQueue.current.length} queued candidates`);
        while (candidateQueue.current.length > 0) {
            const candidate = candidateQueue.current.shift();
            try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate!));
            } catch (e) {
                console.error("❌ Failed to add queued candidate:", e);
            }
        }
    }, []);

    const startCall = useCallback(async (targetUuid: string) => {
        try {
            cleanup();
            console.log(`📞 Starting call to ${targetUuid}`);
            setCallState('calling');
            setRemotePeerUuid(targetUuid);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = createPeerConnection(targetUuid);
            stream.getTracks().forEach(track => {
                console.log(`➕ Adding local track: ${track.kind}`);
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            sendSignal(targetUuid, { type: 'offer', sdp: offer });
        } catch (err) {
            console.error('❌ Failed to start call:', err);
            cleanup();
        }
    }, [createPeerConnection, sendSignal, cleanup]);

    const acceptCall = useCallback(async () => {
        if (!remotePeerUuid) return;

        try {
            console.log(`✅ Accepting call from ${remotePeerUuid}`);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setLocalStream(stream);

            const pc = pcRef.current;
            if (!pc) throw new Error("PeerConnection not initialized");

            stream.getTracks().forEach(track => {
                console.log(`➕ Adding local track to answer: ${track.kind}`);
                pc.addTrack(track, stream);
            });

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            setCallState('connected');
            sendSignal(remotePeerUuid, { type: 'answer', sdp: answer });
            processCandidateQueue();
        } catch (err) {
            console.error('❌ Failed to accept call:', err);
            cleanup();
        }
    }, [remotePeerUuid, sendSignal, cleanup, processCandidateQueue]);

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
        console.log(`📩 Signal received [${signal.type}] from ${from}`);

        if (signal.type === 'offer') {
            if (callState !== 'idle') {
                console.log("🚫 Busy - rejecting offer");
                sendSignal(from, { type: 'reject' });
                return;
            }
            setCallState('incoming');
            setRemotePeerUuid(from);

            const pc = createPeerConnection(from);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
            console.log("📝 Remote description (offer) set");
        } else if (signal.type === 'answer') {
            if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
                console.log("📝 Remote description (answer) set");
                setCallState('connected');
                processCandidateQueue();
            }
        } else if (signal.type === 'candidate') {
            if (pcRef.current && pcRef.current.remoteDescription) {
                try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate!));
                } catch (e) {
                    console.error("❌ Failed to add ICE candidate:", e);
                }
            } else {
                console.log("⬇️ Queuing ICE candidate (remote description not set yet)");
                candidateQueue.current.push(signal.candidate!);
            }
        } else if (signal.type === 'hangup' || signal.type === 'reject') {
            cleanup();
        }
    }, [callState, createPeerConnection, sendSignal, cleanup, processCandidateQueue]);

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
