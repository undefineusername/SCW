import { useCallback, useEffect, useState } from 'react';
import { StreamVideoClient, Call, type MemberRequest } from '@stream-io/video-react-sdk';

export function useStreamVideoCall(currentUserUuid: string | null, videoClient?: StreamVideoClient | null) {
    const [activeCall, setActiveCall] = useState<Call | null>(null);
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);
    const [incomingCallerId, setIncomingCallerId] = useState<string | null>(null);
    const [incomingCallType, setIncomingCallType] = useState<'default' | 'audio_room'>('default');

    useEffect(() => {
        if (!videoClient) return;

        const unsubscribe = videoClient.on('call.created', (event: any) => {
            if (event.call && event.call.created_by?.id !== currentUserUuid) {
                const callerId = event.call.created_by?.id;
                const callType = event.call.type || 'default';
                setIncomingCallerId(callerId || null);
                setIncomingCallType(callType === 'audio_room' ? 'audio_room' : 'default');
                setIncomingCall(videoClient.call(callType, event.call.id));
            }
        });

        return () => unsubscribe();
    }, [videoClient, currentUserUuid]);

    // When active call ends (remote leaves, etc.), clean up state
    useEffect(() => {
        const call = activeCall;
        if (!call) return;

        const handleEnded = () => {
            setActiveCall(null);
            setIncomingCall(null);
            setIncomingCallerId(null);
            console.log('📞 [StreamVideo] Call ended');
        };

        const unsub = call.on('call.ended', handleEnded);
        return () => unsub();
    }, [activeCall]);

    const startCall = useCallback(async (targetUuid: string, type: 'default' | 'audio_room' | 'video' | 'voice' = 'default') => {
        if (!videoClient || !currentUserUuid) return;

        const callId = crypto.randomUUID();
        const streamType = (type === 'voice' || type === 'audio_room') ? 'audio_room' : 'default';
        const call = videoClient.call(streamType, callId);

        // Both participants need admin role to join (JoinBackstage); 'user' role lacks permission
        const members: MemberRequest[] = [
            { user_id: currentUserUuid, role: 'admin' },
            { user_id: targetUuid, role: 'admin' }
        ];

        try {
            await call.getOrCreate({
                data: {
                    members,
                    custom: {
                        callerName: currentUserUuid
                    }
                }
            });
            // Enable devices BEFORE join so remote peer receives our stream
            await call.microphone.enable();
            if (streamType === 'default') {
                try {
                    await call.camera.enable();
                } catch (e) {
                    console.warn('⚠️ [StreamVideo] Camera enable failed (no send-video permission?), continuing with audio:', e);
                }
            }
            await call.join();
            setActiveCall(call);
            console.log('📞 [StreamVideo] Call started:', callId);
        } catch (err) {
            console.error('❌ [StreamVideo] Failed to start call:', err);
        }
    }, [videoClient, currentUserUuid]);

    const joinCall = useCallback(async (call: Call) => {
        try {
            // Enable devices BEFORE join so remote peer receives our stream
            await call.microphone.enable();
            if (call.type === 'default') {
                try {
                    await call.camera.enable();
                } catch (e) {
                    console.warn('⚠️ [StreamVideo] Camera enable failed, continuing with audio:', e);
                }
            }
            await call.join();
            setActiveCall(call);
            setIncomingCall(null);
            setIncomingCallerId(null);
            console.log('📞 [StreamVideo] Call joined:', call.id);
        } catch (err) {
            console.error('❌ [StreamVideo] Failed to join call:', err);
        }
    }, []);

    const leaveCall = useCallback(async () => {
        if (activeCall) {
            await activeCall.leave();
            setActiveCall(null);
            console.log('📞 [StreamVideo] Call left');
        }
    }, [activeCall]);

    const rejectCall = useCallback(() => {
        if (incomingCall) {
            setIncomingCall(null);
            setIncomingCallerId(null);
        }
    }, [incomingCall]);

    return {
        activeCall,
        incomingCall,
        incomingCallerId,
        incomingCallType,
        startCall,
        joinCall,
        leaveCall,
        rejectCall
    };
}
