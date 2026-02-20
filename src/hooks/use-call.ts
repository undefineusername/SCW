import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '@/lib/socket';

export type CallState = 'idle' | 'in-call';
export type CallType = 'voice' | 'video';

interface PeerConnection {
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    analyser?: AnalyserNode;
    dataArray?: Uint8Array;
}

export function useCall(currentUserUuid: string | null, sendSignal: (to: string, signal: any) => void) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [callType, setCallType] = useState<CallType>('video');
    const [peers, setPeers] = useState<Record<string, { stream: MediaStream | null; isSpeaking: boolean }>>({});
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

    const pcMap = useRef<Map<string, PeerConnection>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);
    const activeCallTypeRef = useRef<CallType>('video');

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
        let newSdp = sdp.replace(/a=fmtp:(\d+) (?:.*)/g, (match, _pt) => {
            return `${match};maxaveragebitrate=${bitrate * 1000}`;
        });

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
            if (localAnalyserRef.current) {
                const data = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
                localAnalyserRef.current.getByteFrequencyData(data as any);
                const volume = data.reduce((a, b) => a + b, 0) / data.length;
                setIsLocalSpeaking(volume > 15);
            }

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

        const handleVisibilityChange = () => {
            if (document.hidden && localStreamRef.current) {
                localStreamRef.current.getVideoTracks().forEach(track => {
                    if (track.enabled) {
                        track.enabled = false;
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

    const joinCall = useCallback(async (groupId: string, type: CallType = 'video') => {
        try {
            cleanup();
            setCallState('in-call');
            setCallType(type);
            activeCallTypeRef.current = type;

            let stream: MediaStream;
            if (type === 'video') {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            frameRate: { ideal: 24 }
                        },
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
            } else {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true }
                });
                setIsCameraOn(false);
            }

            localStreamRef.current = stream;
            setLocalStream(stream);

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
                answer.sdp = setBitrate(answer.sdp!, 1000);
                await pc.setLocalDescription(answer);
                sendSignal(from, { type: 'answer', sdp: answer, from: currentUserUuid });
            } else if (signal.type === 'answer') {
                if (pc) await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp!));
            } else if (signal.type === 'candidate') {
                if (pc) await pc.addIceCandidate(new RTCIceCandidate(signal.candidate!));
            } else if (signal.type === 'reject') {
                cleanup();
            }
        } catch (err) {
            console.error('WebRTC Signaling Error:', err);
        }
    }, [currentUserUuid, createPeerConnection, sendSignal]);

    const leaveCall = useCallback(() => {
        getSocket().emit('leave_call', { groupId: 'current' });
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
                if (videoTrack.enabled) {
                    setCallType('video');
                    activeCallTypeRef.current = 'video';
                }
            } else if (!isCameraOn) {
                try {
                    const freshStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            frameRate: { ideal: 24 }
                        }
                    });
                    const freshTrack = freshStream.getVideoTracks()[0];
                    localStreamRef.current.addTrack(freshTrack);

                    pcMap.current.forEach(peer => {
                        const sender = peer.pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) {
                            sender.replaceTrack(freshTrack);
                        } else {
                            peer.pc.addTrack(freshTrack, localStreamRef.current!);
                        }
                    });

                    setIsCameraOn(true);
                    setCallType('video');
                    activeCallTypeRef.current = 'video';
                } catch (err) {
                    console.error('Failed to enable camera:', err);
                }
            }
        }
    }, [isCameraOn]);

    const initiateConnections = useCallback(async (participants: string[]) => {
        // 1. Remove peers not in participants list
        const activeParticipants = new Set(participants);
        pcMap.current.forEach((_, uuid) => {
            if (!activeParticipants.has(uuid) && uuid !== currentUserUuid) {
                const pc = pcMap.current.get(uuid)?.pc;
                if (pc) pc.close();
                pcMap.current.delete(uuid);
                setPeers(prev => {
                    const next = { ...prev };
                    delete next[uuid];
                    return next;
                });
            }
        });

        // 2. Add new peers
        for (const uuid of participants) {
            if (uuid === currentUserUuid || pcMap.current.has(uuid)) continue;
            const pc = createPeerConnection(uuid);
            const offer = await pc.createOffer();
            offer.sdp = setBitrate(offer.sdp!, 1000);
            await pc.setLocalDescription(offer);
            // We include callType in the offer to let others know
            sendSignal(uuid, { type: 'offer', sdp: offer, from: currentUserUuid, callType: activeCallTypeRef.current });
        }
    }, [currentUserUuid, createPeerConnection, sendSignal]);

    return {
        callState,
        callType,
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
