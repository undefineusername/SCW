import { StreamVideoClient, useCallStateHooks } from '@stream-io/video-react-sdk';
export type { CallType } from './use-webrtc';

export const useCall = (
    _currentUserUuid: string | null,
    _videoClient?: StreamVideoClient | null,
    streamCall?: any,
    _onCallStarted?: any,
    _onCallEnded?: any
) => {
    // We now receive streamCall from the parent to ensure it's within the StreamCall context if needed

    // Get reactive state from Stream Call hooks
    const { useLocalParticipant, useRemoteParticipants } = useCallStateHooks();
    const localParticipant = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    // Map Stream participants identifying them as remote peers
    const peers: Record<string, any> = {};
    remoteParticipants.forEach((p: any) => {
        peers[p.userId] = {
            stream: p.videoStream || p.audioStream || null,
            connectionState: 'connected',
            isSpeaking: p.isSpeaking,
            isMuted: !p.audioEnabled,
            isCameraOn: p.videoEnabled,
            avatar: p.image,
            username: p.name || `User-${p.userId.slice(0, 8)}`
        };
    });

    return {
        activeCall: streamCall.activeCall, // Return the call object for Provider usage
        localStream: localParticipant?.videoStream || null,
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
