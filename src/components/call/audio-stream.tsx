'use client';

import { useEffect, useRef } from 'react';

export default function AudioStream({ stream, muted = false }: { stream: MediaStream | null; muted?: boolean }) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(e => console.error("Audio play failed", e));
        }
    }, [stream]);

    if (!stream) return null;

    return <audio ref={audioRef} autoPlay muted={muted} className="hidden" />;
}
