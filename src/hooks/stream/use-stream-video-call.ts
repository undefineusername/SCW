import { useCallback, useEffect, useState } from 'react';
import { useStreamVideoClient, Call, type MemberRequest } from '@stream-io/video-react-sdk';

export function useStreamVideoCall(currentUserUuid: string | null) {
    const videoClient = useStreamVideoClient();
    const [activeCall, setActiveCall] = useState<Call | null>(null);
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);

    useEffect(() => {
        if (!videoClient) return;

        const unsubscribe = videoClient.on('call.created', (event) => {
            if (event.call && event.call.created_by.id !== currentUserUuid) {
                setIncomingCall(videoClient.call(event.call.type, event.call.id));
            }
        });

        return () => unsubscribe();
    }, [videoClient, currentUserUuid]);

    const startCall = useCallback(async (targetUuid: string, type: 'default' | 'audio_room' | 'video' | 'voice' = 'default') => {
        if (!videoClient || !currentUserUuid) return;

        const callId = crypto.randomUUID();
        const streamType = (type === 'voice' || type === 'audio_room') ? 'audio_room' : 'default';
        const call = videoClient.call(streamType, callId);

        const members: MemberRequest[] = [
            { user_id: currentUserUuid, role: 'admin' },
            { user_id: targetUuid, role: 'user' }
        ];

        try {
            await call.getOrCreate({
                data: {
                    members,
                    custom: {
                        callerName: currentUserUuid // Could be actual username
                    }
                }
            });
            await call.join();
            setActiveCall(call);
            console.log('📞 [StreamVideo] Call started:', callId);
        } catch (err) {
            console.error('❌ [StreamVideo] Failed to start call:', err);
        }
    }, [videoClient, currentUserUuid]);

    const joinCall = useCallback(async (call: Call) => {
        try {
            await call.join();
            setActiveCall(call);
            setIncomingCall(null);
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
        }
    }, [incomingCall]);

    return {
        activeCall,
        incomingCall,
        startCall,
        joinCall,
        leaveCall,
        rejectCall
    };
}
