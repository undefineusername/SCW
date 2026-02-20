import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '@/lib/socket';

export type CallState = 'idle' | 'in-call';

interface PeerConnection {
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    analyser?: AnalyserNode;
    dataArray?: Uint8Array;
}

export function useGroupCall(currentUserUuid: string | null, sendSignal: (to: string, signal: any) => void) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [peers, setPeers] = useState<Record<string, { stream: MediaStream | null; isSpeaking: boolean }>>({});
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

    const pcMap = useRef<Map<string, PeerConnection>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);

    const cleanup = useCallback(() => {
        pcMap.current.forEach(peer => {
            peer.pc.close();
        });
        pcMap.current.clear();

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(console.error);
            audioCtxRef.current = null;
        }

        setLocalStream(null);
        setPeers({});
        setCallState('idle');
    }, []);

    const setBitrate = (sdp: string, bitrate: number) => {
        // Find the video media section and insert b=AS line or modify existing fmtp
        let newSdp = sdp.replace(/a=fmtp:(\d+) (?:.*)/g, (match, _pt) => {
            return `${match};maxaveragebitrate=${bitrate * 1000}`;
        });

        // Add bandwidth limit for video (b=AS:1000 for 1Mbps)
        if (newSdp.includes('m=video')) {
            newSdp = newSdp.replace(/m=video.*\r\n/g, (match) => {
                return `${match}b=AS:${bitrate}\r\n`;
            });
        }
        return newSdp;
    };

    const createPeerConnection = useCallback((targetUuid: string) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        const peerInfo: PeerConnection = { pc, stream: null };
        pcMap.current.set(targetUuid, peerInfo);

        pc.onicecandidate = (event) => {
            if (event.candidate && currentUserUuid) {
                sendSignal(targetUuid, { type: 'candidate', candidate: event.candidate, from: currentUserUuid });
            }
        };

        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            peerInfo.stream = remoteStream;

            // Setup Analyser for VAD
            if (audioCtxRef.current) {
                const source = audioCtxRef.current.createMediaStreamSource(remoteStream);
                const analyser = audioCtxRef.current.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                peerInfo.analyser = analyser;
                peerInfo.dataArray = new Uint8Array(analyser.frequencyBinCount);
            }

            setPeers(prev => ({
                ...prev,
                [targetUuid]: { stream: remoteStream, isSpeaking: false }
            }));
        };

        pc.oniceconnectionstatechange = () => {
            if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                pc.close();
                pcMap.current.delete(targetUuid);
                setPeers(prev => {
                    const next = { ...prev };
                    delete next[targetUuid];
                    return next;
                });
            }
        };

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current!);
            });
        }

        return pc;
    }, [currentUserUuid, sendSignal]);

    useEffect(() => {
        if (callState !== 'in-call') return;

        const checkVAD = () => {
            // Local VAD
            if (localAnalyserRef.current) {
                const data = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
                localAnalyserRef.current.getByteFrequencyData(data as any);
                const volume = data.reduce((a, b) => a + b, 0) / data.length;
                setIsLocalSpeaking(volume > 15); // Adjust threshold
            }

            // Peers VAD
            setPeers(prev => {
                let changed = false;
                const next = { ...prev };
                pcMap.current.forEach((peer, uuid) => {
                    if (peer.analyser && peer.dataArray) {
                        peer.analyser.getByteFrequencyData(peer.dataArray as any);
                        const volume = peer.dataArray.reduce((a, b) => a + b, 0) / peer.dataArray.length;
                        const isSpeaking = volume > 15;
                        if (next[uuid]?.isSpeaking !== isSpeaking) {
                            next[uuid] = { ...next[uuid], isSpeaking };
                            changed = true;
                        }
                    }
                });
                return changed ? next : prev;
            });
        };

        const interval = setInterval(checkVAD, 100);

        // Visibility Change Handler - Pause video when tab is hidden
        const handleVisibilityChange = () => {
            if (document.hidden && localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach(track => {
                    if (track.enabled) {
                        track.enabled = false;
                        // We don't update state here to keep UI consistent, 
                        // just disabling track for performance/privacy
                    }
                });
            } else if (!document.hidden && localStreamRef.current && isCameraOn) {
                localStreamRef.current.getVideoTracks().forEach(track => {
                    track.enabled = true;
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [callState, isCameraOn]);

    const joinCall = useCallback(async (groupId: string, _participantUuids: string[]) => {
        try {
            cleanup();
            setCallState('in-call');

            let stream: MediaStream;
            try {
                // Try to get both video and audio
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, frameRate: 24 },
                    audio: { echoCancellation: true, noiseSuppression: true }
                });
                setIsCameraOn(true);
            } catch (err) {
                console.warn('Camera failed/denied, falling back to audio-only:', err);
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true }
                });
                setIsCameraOn(false);
            }

            localStreamRef.current = stream;
            setLocalStream(stream);

            // Setup AudioContext for VAD
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            localAnalyserRef.current = analyser;

            getSocket().emit('join_call', { groupId });
        } catch (err) {
            console.error('Failed to join group call:', err);
            cleanup();
        }
    }, [cleanup]);

    const handleSignal = useCallback(async (signal: any) => {
        const from = signal.from;
        if (!from || from === currentUserUuid) return;

        let peer = pcMap.current.get(from);
        let pc = peer?.pc;

        try {
            if (signal.type === 'offer') {
                if (!pc) pc = createPeerConnection(from);
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
                const answer = await pc.createAnswer();
                answer.sdp = setBitrate(answer.sdp!, 1000); // Limit to 1000kbps (1Mbps)
                await pc.setLocalDescription(answer);
                sendSignal(from, { type: 'answer', sdp: answer, from: currentUserUuid });
            } else if (signal.type === 'answer') {
                if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
            } else if (signal.type === 'candidate') {
                if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate!));
            }
        } catch (err) {
            console.error('WebRTC Signaling Error:', err);
        }
    }, [currentUserUuid, createPeerConnection, sendSignal]);

    const leaveCall = useCallback(() => {
        getSocket().emit('leave_call', { groupId: 'current' }); // Backend clears all calls on disconnect/explicit leave
        cleanup();
    }, [cleanup]);

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
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsCameraOn(videoTrack.enabled);
            } else if (!isCameraOn) {
                // If no video track exists, try to add one (e.g. if user previously denied permission but now allows)
                try {
                    const freshStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480, frameRate: 24 }
                    });
                    const freshTrack = freshStream.getVideoTracks()[0];
                    localStreamRef.current.addTrack(freshTrack);

                    // Update all current PeerConnections with the new track
                    pcMap.current.forEach(peer => {
                        peer.pc.addTrack(freshTrack, localStreamRef.current!);
                    });

                    setIsCameraOn(true);
                } catch (err) {
                    console.error('Failed to enable camera:', err);
                }
            }
        }
    }, [isCameraOn]);

    const initiateConnections = useCallback(async (participants: string[]) => {
        for (const uuid of participants) {
            if (uuid === currentUserUuid || pcMap.current.has(uuid)) continue;
            const pc = createPeerConnection(uuid);
            const offer = await pc.createOffer();
            offer.sdp = setBitrate(offer.sdp!, 1000);
            await pc.setLocalDescription(offer);
            sendSignal(uuid, { type: 'offer', sdp: offer, from: currentUserUuid });
        }
    }, [currentUserUuid, createPeerConnection, sendSignal]);

    return {
        callState,
        peers,
        localStream,
        isMuted,
        isCameraOn,
        isLocalSpeaking,
        joinCall,
        leaveCall,
        handleSignal,
        toggleMute,
        toggleCamera,
        initiateConnections
    };
}
