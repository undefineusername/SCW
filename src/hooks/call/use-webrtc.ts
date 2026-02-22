import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

export type CallType = 'voice' | 'video';

export interface PeerState {
    stream: MediaStream | null;
    connectionState: RTCPeerConnectionState;
    iceState: RTCIceConnectionState;
    isSpeaking: boolean;
    isMuted: boolean;
    isCameraOn: boolean;
}

type WebRTCSignal =
    | { type: 'offer'; from: string; sdp: RTCSessionDescriptionInit; callType?: CallType; candidate?: never }
    | { type: 'answer'; from: string; sdp: RTCSessionDescriptionInit; candidate?: never; callType?: never }
    | { type: 'candidate'; from: string; candidate: RTCIceCandidateInit; sdp?: never; callType?: never }
    | { type: 'call_user_joined'; uuid: string; groupId: string; from?: never }
    | { type: 'call_user_left'; uuid: string; groupId: string; from?: never };

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
];

export function useWebRTC(
    currentUserUuid: string | null,
    onCallStarted?: (groupId: string, type: CallType) => void,
    onCallEnded?: (groupId: string, type: CallType, duration: number) => void
) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<Record<string, PeerState>>({});
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isCallActive, setIsCallActive] = useState(false);
    const [incomingCall, setIncomingCall] = useState<{ from: string; type: CallType; signal: any } | null>(null);

    const pcMap = useRef<Map<string, RTCPeerConnection>>(new Map());
    const candidatesQueue = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const activeGroupIdRef = useRef<string | null>(null);
    const callStartTimeRef = useRef<number | null>(null);
    const callTypeRef = useRef<CallType>('video');

    // VAD Refs
    const audioCtxRef = useRef<AudioContext | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);

    // --- Cleanup Function ---
    const cleanup = useCallback(() => {
        console.log("🧹 [WebRTC] Cleanup triggered");
        const duration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
        const gid = activeGroupIdRef.current;
        const type = callTypeRef.current;

        if (isCallActive && gid && onCallEnded) {
            onCallEnded(gid, type, duration);
        }

        pcMap.current.forEach((pc) => pc.close());
        pcMap.current.clear();
        candidatesQueue.current.clear();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }
        localAnalyserRef.current = null;

        setLocalStream(null);
        setPeers({});
        setIsCallActive(false);
        setIsMuted(false);
        setIsCameraOn(false);
        activeGroupIdRef.current = null;
        callStartTimeRef.current = null;
    }, [isCallActive, onCallEnded]);

    // --- Peer Connection Management ---
    const createPeerConnection = useCallback((targetUuid: string, politely: boolean) => {
        console.log(`Creating PeerConnection for ${targetUuid} (polite: ${politely})`);
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcMap.current.set(targetUuid, pc);

        // Add local tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTransceiver(track, { streams: [localStreamRef.current!] });
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                getSocket().emit('signal', {
                    to: targetUuid,
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            console.log(`📡 [WebRTC] Track received from ${targetUuid}:`, event.track.kind);
            const rawStream = event.streams[0] || new MediaStream([event.track]);

            setPeers(prev => {
                // Return a new state with a new MediaStream instance so React components re-init their video refs
                const nextStream = new MediaStream(rawStream.getTracks());
                return {
                    ...prev,
                    [targetUuid]: {
                        ...prev[targetUuid],
                        stream: nextStream,
                        connectionState: pc.connectionState,
                        iceState: pc.iceConnectionState
                    }
                };
            });
        };

        pc.onconnectionstatechange = () => {
            console.log(`📡 [WebRTC] Connection state for ${targetUuid}: ${pc.connectionState}`);
            setPeers(prev => ({
                ...prev,
                [targetUuid]: { ...prev[targetUuid], connectionState: pc.connectionState }
            }));

            // Auto-end 1:1 call if the only peer disconnects
            if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                if (activeGroupIdRef.current === targetUuid) {
                    console.log("⚠️ 1:1 Peer connection lost, hanging up...");
                    setTimeout(() => leaveCall(), 1500);
                }
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log(`📡 [WebRTC] ICE state for ${targetUuid}: ${pc.iceConnectionState}`);
            setPeers(prev => ({
                ...prev,
                [targetUuid]: { ...prev[targetUuid], iceState: pc.iceConnectionState }
            }));

            if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                if (activeGroupIdRef.current === targetUuid) {
                    setTimeout(() => leaveCall(), 1500);
                }
            }
        };

        // Initialize peer state
        setPeers(prev => ({
            ...prev,
            [targetUuid]: {
                stream: null,
                connectionState: 'new',
                iceState: 'new',
                isSpeaking: false,
                isMuted: false,
                isCameraOn: false // Default assumption, updated via signaling or tracks
            }
        }));

        return pc;
    }, []);

    // --- Signaling Handling ---
    const handleSignal = useCallback(async (data: WebRTCSignal) => {
        if (!currentUserUuid) return;

        // 1. User Joined / Left (Broadcasts)
        if (data.type === 'call_user_joined') {
            console.log(`User joined: ${data.uuid}`);
            if (activeGroupIdRef.current) {
                const isImpolite = currentUserUuid < data.uuid;
                if (isImpolite) {
                    const pc = createPeerConnection(data.uuid, false);
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    getSocket().emit('signal', { to: data.uuid, type: 'offer', sdp: offer });
                }
            }
            return;
        }

        if (data.type === 'call_user_left') {
            console.log(`User left: ${data.uuid}`);
            const pc = pcMap.current.get(data.uuid);
            if (pc) {
                pc.close();
                pcMap.current.delete(data.uuid);
            }

            setPeers(prev => {
                const next = { ...prev };
                delete next[data.uuid];

                // 1:1 Call Auto-End: If the person who left is our 1:1 target, end the call
                if (activeGroupIdRef.current === data.uuid || Object.keys(next).length === 0) {
                    console.log("Empty call or peer left in 1:1, hanging up...");
                    // Use a timeout to avoid state update during render/effect cycle if needed, 
                    // though leaveCall is a callback. 
                    setTimeout(() => leaveCall(), 100);
                }

                return next;
            });
            return;
        }

        // 2. Direct WebRTC Signaling
        const { from } = data;
        if (from === currentUserUuid) return;

        // Auto-join handling (Incoming Call)
        if (!activeGroupIdRef.current) {
            if (data.type === 'offer') {
                setIncomingCall({ from, type: data.callType || 'video', signal: data });
            }
            return;
        }

        let pc = pcMap.current.get(from);
        const polite = currentUserUuid > from;

        if (data.type === 'offer') {
            const { sdp } = data;
            const offerCollision = () => {
                return (pc?.signalingState !== 'stable') && (pc?.signalingState !== 'have-local-offer');
            }

            if (!pc) {
                pc = createPeerConnection(from, polite);
            }

            if (offerCollision()) {
                if (!polite) {
                    console.log("Ignored colliding offer (Impolite)");
                    return;
                }
                // Polite peer - usually would rollback if needed, but we rely on simple glare handling for now
            }

            if (sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                // Process queued candidates
                const queue = candidatesQueue.current.get(from);
                if (queue) {
                    for (const c of queue) {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    }
                    candidatesQueue.current.delete(from);
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                getSocket().emit('signal', { to: from, type: 'answer', sdp: answer });
            }

        } else if (data.type === 'answer') {
            const { sdp } = data;
            if (!pc) return;
            if (sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                // Process queued candidates
                const queue = candidatesQueue.current.get(from);
                if (queue) {
                    for (const c of queue) {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    }
                    candidatesQueue.current.delete(from);
                }
            }

        } else if (data.type === 'candidate') {
            const { candidate } = data;
            if (candidate) {
                if (!pc || !pc.remoteDescription) {
                    const queue = candidatesQueue.current.get(from) || [];
                    queue.push(candidate);
                    candidatesQueue.current.set(from, queue);
                } else {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            }
        }

    }, [currentUserUuid, createPeerConnection]);

    // --- Negotiation Trigger ---
    const triggerRenegotiation = useCallback(() => {
        pcMap.current.forEach(async (pc, uuid) => {
            if (pc.signalingState === 'stable') {
                console.log(`🔄 Triggering renegotiation for ${uuid}`);
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    getSocket().emit('signal', { to: uuid, type: 'offer', sdp: offer });
                } catch (e) {
                    console.error(`❌ Renegotiation failed for ${uuid}:`, e);
                }
            }
        });
    }, []);

    // --- Global Socket Listeners ---
    useEffect(() => {
        if (!currentUserUuid) return;
        const socket = getSocket();

        const onSignal = (data: any) => handleSignal(data);
        const onUserJoined = (data: any) => handleSignal({ ...data, type: 'call_user_joined' });
        const onUserLeft = (data: any) => handleSignal({ ...data, type: 'call_user_left' });

        socket.on('signal', onSignal);
        socket.on('call_user_joined', onUserJoined);
        socket.on('call_user_left', onUserLeft);

        return () => {
            socket.off('signal', onSignal);
            socket.off('call_user_joined', onUserJoined);
            socket.off('call_user_left', onUserLeft);
        };
    }, [currentUserUuid, handleSignal]);

    // --- Join Call ---
    const joinCall = useCallback(async (groupId: string, type: CallType = 'video') => {
        console.log(`📡 [WebRTC] joinCall triggered: groupId=${groupId}, type=${type}`);
        // alert(`통화 시작 시도: ${type}`); // 임시 디버깅용 알림

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("❌ navigator.mediaDevices.getUserMedia is not available. Are you on HTTPS or localhost?");
            alert("카메라/마이크를 사용할 수 없는 환경입니다. (HTTPS 연결이 아니거나 브라우저에서 차단됨)");
            return;
        }

        cleanup();
        activeGroupIdRef.current = groupId;
        callTypeRef.current = type;
        callStartTimeRef.current = Date.now();
        setIsCallActive(true);

        if (onCallStarted) {
            onCallStarted(groupId, type);
        }

        try {
            let stream: MediaStream;
            try {
                console.log(`🎥 Requesting media: audio=true, video=${type === 'video'}`);

                const idealConstraints: MediaStreamConstraints = {
                    audio: true,
                    video: type === 'video' ? {
                        facingMode: "user",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } : false
                };

                try {
                    stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
                } catch (firstErr) {
                    if (type === 'video') {
                        console.warn("⚠️ Ideal constraints failed, trying simple video:true...", firstErr);
                        try {
                            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                        } catch (secondErr) {
                            console.error("❌ Even simple video failed, falling back to audio-only", secondErr);
                            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        }
                    } else {
                        throw firstErr;
                    }
                }

                console.log("✅ Media stream obtained:", stream.id);

                // 트랙이 제대로 확보되었는지 확인
                const hasVideo = stream.getVideoTracks().length > 0;
                if (type === 'video' && !hasVideo) {
                    console.warn("⚠️ Video requested but no video track found in stream!");
                }

                setIsCameraOn(type === 'video' && hasVideo);
            } catch (err: any) {
                console.error("❌ Critical media error (likely no audio device):", err);
                alert("마이크 또는 카메라 장치를 찾을 수 없거나 접근이 차단되었습니다.");
                cleanup();
                return;
            }

            localStreamRef.current = stream;
            setLocalStream(stream);

            // Initial Join Event
            getSocket().emit('join_call', { groupId });

            // Note: The server sends 'call_participants_list' in response.
            getSocket().once('call_participants_list', async ({ participants }: { participants: string[] }) => {
                console.log("Participants in call:", participants);

                // If we are the only one in the call, and it might be a 1:1 call,
                // try to "ring" the other side by sending an initial offer to the groupId.
                if (participants.length <= 1 && groupId !== currentUserUuid) {
                    console.log(`📡 Sending initial ring offer to ${groupId}`);
                    const pc = createPeerConnection(groupId, false);
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    getSocket().emit('signal', {
                        to: groupId,
                        type: 'offer',
                        sdp: offer,
                        callType: type,
                        groupId: groupId
                    });
                }

                for (const uuid of participants) {
                    if (uuid === currentUserUuid) continue;
                    if (currentUserUuid! < uuid) {
                        const pc = createPeerConnection(uuid, false);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        getSocket().emit('signal', { to: uuid, type: 'offer', sdp: offer });
                    }
                }
            });

        } catch (err) {
            console.error("❌ Failed to join call:", err);
            cleanup();
        }
    }, [cleanup, currentUserUuid, createPeerConnection, handleSignal]);

    // --- VAD Polling ---
    useEffect(() => {
        if (!isCallActive) return;
        const interval = setInterval(() => {
            // Local
            if (localAnalyserRef.current) {
                const data = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
                localAnalyserRef.current.getByteFrequencyData(data);
                // const vol = data.reduce((a, b) => a + b, 0) / data.length;
                // We don't have isLocalSpeaking state exposed yet, but we can?
                // For now, ignoring local speaking state in hook return.
            }

            // Remote
            setPeers(prev => {
                let changed = false;
                const next = { ...prev };
                pcMap.current.forEach((pc, uuid) => {
                    const analyser = (pc as any)._analyser as AnalyserNode;
                    if (analyser) {
                        const data = new Uint8Array(analyser.frequencyBinCount);
                        analyser.getByteFrequencyData(data);
                        const vol = data.reduce((a, b) => a + b, 0) / data.length;
                        const isSpeaking = vol > 15;
                        if (next[uuid]?.isSpeaking !== isSpeaking) {
                            next[uuid] = { ...next[uuid], isSpeaking };
                            changed = true;
                        }
                    }
                });
                return changed ? next : prev;
            });

        }, 100);
        return () => clearInterval(interval);
    }, [isCallActive]);

    // --- Controls ---
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsMuted(!track.enabled);
            }
        }
    }, []);

    const toggleCamera = useCallback(async () => {
        if (!localStreamRef.current) return;

        let videoTrack = localStreamRef.current.getVideoTracks()[0];

        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            // Also notify peers about mute/unmute if needed, though WebRTC handles stream mute
            setIsCameraOn(videoTrack.enabled);
            // Force re-render of local video
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        } else {
            try {
                console.log("🎥 Requesting camera permission...");
                let videoStream: MediaStream;
                try {
                    videoStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            facingMode: "user"
                        }
                    });
                } catch (e) {
                    console.warn("⚠️ Ideal camera constraints failed, trying simple video:true", e);
                    videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                }

                videoTrack = videoStream.getVideoTracks()[0];
                localStreamRef.current.addTrack(videoTrack);

                // Add to existing connections
                pcMap.current.forEach(pc => {
                    pc.addTrack(videoTrack, localStreamRef.current!);
                });

                setIsCameraOn(true);
                setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

                // Must renegotiate to let peers see the new track
                triggerRenegotiation();
            } catch (e) {
                console.error("❌ Failed to enable camera:", e);
                // Optionally show error to user
            }
        }
    }, [triggerRenegotiation]);

    const leaveCall = useCallback(() => {
        if (activeGroupIdRef.current) {
            getSocket().emit('leave_call', { groupId: activeGroupIdRef.current });
        }
        cleanup();
    }, [cleanup]);

    const acceptCall = useCallback(async () => {
        if (!incomingCall) return;
        const { from, signal } = incomingCall;
        setIncomingCall(null);

        // Join the call (conceptually, we are answering headers first? No, we just start the flow)
        // We need to trigger the "start call" logic but as a responder.
        // We can reuse joinCall if we know the groupId.
        // The signal SHOULD contain groupId.
        const groupId = signal.groupId || from; // Fallback to 'from' if p2p 1:1 without group ID?

        await joinCall(groupId, incomingCall.type);

        // After joining, we need to process the offer that triggered this.
        // We can direct call handleSignal.
        // We need to bypass the "activeGroupIdRef" check? 
        // joinCall sets activeGroupIdRef synchronously? No, it's inside joinCall.

        // Wait a tick for state to settle?
        handleSignal(signal);

    }, [incomingCall, joinCall, handleSignal]);

    const rejectCall = useCallback(() => {
        setIncomingCall(null);
        // Optional: send reject signal
    }, []);

    return {
        localStream,
        peers,
        isMuted,
        isCameraOn,
        isCallActive,
        incomingCall,
        joinCall,
        leaveCall,
        acceptCall,
        rejectCall,
        toggleMute,
        toggleCamera
    };
}
