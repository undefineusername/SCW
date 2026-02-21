import { useStreamVideoCall } from '../stream/use-stream-video-call';
export type { CallType } from './use-webrtc'; // Keep types for now

export const useCall = (currentUserUuid: string | null, _onCallStarted?: any, _onCallEnded?: any) => {
    const streamCall = useStreamVideoCall(currentUserUuid);

    // Map Stream participants identifying them as remote peers
    const peers: Record<string, any> = {};
    if (streamCall.activeCall) {
        streamCall.activeCall.state.participants.forEach((p: any) => {
            if (p.userId === currentUserUuid) return;
            peers[p.userId] = {
                stream: null,
                connectionState: 'connected',
                isSpeaking: p.isSpeaking,
                isMuted: !p.audioEnabled,
                isCameraOn: p.videoEnabled
            };
        });
    }

    return {
        localStream: null,
        peers,
        isMuted: streamCall.activeCall?.microphone?.state?.status === 'disabled',
        isCameraOn: streamCall.activeCall?.camera?.state?.status === 'enabled',
        isCallActive: !!streamCall.activeCall,
        incomingCall: streamCall.incomingCall ? { from: streamCall.incomingCall.id, type: 'video' as const, signal: {} } : null,
        joinCall: (groupId: string, type: 'video' | 'voice') => streamCall.startCall(groupId, type === 'video' ? 'default' : 'audio_room'),
        leaveCall: streamCall.leaveCall,
        acceptCall: () => streamCall.incomingCall && streamCall.joinCall(streamCall.incomingCall),
        rejectCall: streamCall.rejectCall,
        toggleMute: () => streamCall.activeCall?.microphone.toggle(),
        toggleCamera: () => streamCall.activeCall?.camera.toggle(),
    };
};
