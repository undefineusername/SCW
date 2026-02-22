// use-call.ts
// NOTE: useCallStateHooks() CANNOT be called here — it requires a <StreamCall> context provider.
// Instead, we read state from the streamCall object passed from the parent (AuthenticatedApp),
// which wraps content in <StreamCall> when a call is active.

export type { CallType } from './use-webrtc';

export const useCall = (
    _currentUserUuid: string | null,
    _videoClient?: any,
    streamCall?: any,
    _onCallStarted?: any,
    _onCallEnded?: any
) => {
    const activeCall = streamCall?.activeCall ?? null;

    // Read participant state directly from the call's reactive state object.
    // This is safe to do unconditionally — state.participants is an empty array when no call is active.
    const participants: any[] = activeCall?.state?.participants ?? [];
    const localParticipant = activeCall?.state?.localParticipant ?? null;

    // Map remote participants to peers (sessionId needed for bindVideoElement)
    const peers: Record<string, any> = {};
    participants.forEach((p: any) => {
        if (p.isLocalParticipant) return; // skip self
        peers[p.userId] = {
            sessionId: p.sessionId,
            stream: p.videoStream || p.audioStream || null,
            connectionState: 'connected',
            isSpeaking: p.isSpeaking,
            isMuted: !p.audioEnabled,
            isCameraOn: p.videoEnabled,
            avatar: p.image,
            username: p.name || `User-${p.userId?.slice(0, 8)}`
        };
    });

    return {
        activeCall,
        localStream: localParticipant?.videoStream ?? null,
        peers,
        isMuted: activeCall?.microphone?.state?.status === 'disabled',
        isCameraOn: activeCall?.camera?.state?.status === 'enabled',
        isCallActive: !!activeCall,
        incomingCall: streamCall?.incomingCall
            ? { from: streamCall.incomingCall.id, type: 'video' as const, signal: {} }
            : null,
        joinCall: (groupId: string, type: 'video' | 'voice') =>
            streamCall?.startCall?.(groupId, type === 'video' ? 'default' : 'audio_room'),
        leaveCall: streamCall?.leaveCall ?? (() => { }),
        acceptCall: () => streamCall?.incomingCall && streamCall?.joinCall?.(streamCall.incomingCall),
        rejectCall: streamCall?.rejectCall ?? (() => { }),
        toggleMute: () => activeCall?.microphone?.toggle?.(),
        toggleCamera: () => activeCall?.camera?.toggle?.(),
    };
};
