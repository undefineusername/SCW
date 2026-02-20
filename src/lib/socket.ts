import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://simple-chat.up.railway.app';

let socket: Socket | null = null;
let currentHardwareId: string | null = null;

export const getSocket = () => {
    if (!socket) {
        socket = io(SOCKET_URL, {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000,
            transports: ['polling', 'websocket'] // Try polling first, then upgrade (standard)
        });

        socket.on('connect_error', (err) => {
            console.error('Socket Connection Error:', err.message);
        });
    }
    return socket;
};

export const registerMaster = (details: { uuid: string; username?: string; salt?: string; kdfParams?: any; publicKey?: any }) => {
    const s = getSocket();
    currentHardwareId = details.uuid;

    // Registration function
    const performRegistration = () => {
        if (!currentHardwareId) return;
        console.log('🔌 Connecting & Registering Master:', currentHardwareId);
        s.emit('register_master', details);
    };

    // Remove old listeners using the specific handler names if they were stored, 
    // or just use s.off(event) to clear all if we want to be aggressive.
    // Given the structure, s.removeAllListeners or individual off is better.
    s.off('connect');
    s.off('registered');
    s.off('error_msg');

    s.on('connect', () => {
        console.log('🔌 Socket Connected');
        performRegistration();
    });

    s.on('registered', (data: { type: string; uuid: string }) => {
        console.log('✅ Registered as', data.type, 'with ID:', data.uuid);
    });

    s.on('error_msg', (data: { message: string }) => {
        console.error('❌ Relay error:', data.message);
    });

    if (!s.connected) {
        s.connect();
    } else {
        performRegistration();
    }

    return s;
};

export const waitForConnection = (timeout = 5000): Promise<boolean> => {
    const s = getSocket();
    if (s.connected) return Promise.resolve(true);

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            s.off('connect', onConnect);
            resolve(false);
        }, timeout);

        const onConnect = () => {
            clearTimeout(timer);
            resolve(true);
        };

        s.once('connect', onConnect);
        s.connect();
    });
};

export const connectSocket = registerMaster; // Alias for backward compatibility
