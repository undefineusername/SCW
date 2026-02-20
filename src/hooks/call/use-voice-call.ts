// Deprecated. Use use-call.ts (which uses use-webrtc.ts) instead.
export type CallState = 'idle' | 'calling' | 'connected' | 'disconnected' | 'error';

export const useVoiceCall = () => {
    throw new Error("useVoiceCall is deprecated. Use useCall instead.");
};
