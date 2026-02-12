'use client';

import { useState } from 'react';
import { generateKeys } from '@/lib/crypto';
import { getSocket, waitForConnection } from '@/lib/socket';
import { db } from '@/lib/db';
import { Lock as LockIcon, User, Loader2 } from 'lucide-react';

interface AuthScreenProps {
    onAuthenticated: (uuid: string, key: Uint8Array, username: string, salt?: string, kdfParams?: any) => void;
    isDark: boolean;
}

export default function AuthScreen({ onAuthenticated, isDark }: AuthScreenProps) {
    const [username, setUsername] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [serverAccount, setServerAccount] = useState<{ salt: string; kdfParams: any } | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !passphrase) return;

        setIsLoading(true);
        setError('');
        setStatus('Initializing secure tunnel...');

        try {
            const socket = getSocket();

            // 1. Connection check first
            setStatus('Connecting to relay server...');
            const connected = await waitForConnection(5000);
            if (!connected) {
                throw new Error('Relay server is unreachable. Check your connection.');
            }

            // 2. Lookup salt if not already found
            let currentSalt = serverAccount?.salt;
            let currentKdf = serverAccount?.kdfParams;

            if (!currentSalt) {
                setStatus('Retrieving account metadata...');
                const lookupPromise = new Promise<{ salt: string; kdfParams: any } | null>((resolve) => {
                    const t = setTimeout(() => {
                        socket.off('salt_found');
                        socket.off('salt_not_found');
                        resolve(null);
                    }, 3000);

                    socket.once('salt_found', (data: { uuid: string; salt: string; kdfParams: any }) => {
                        clearTimeout(t);
                        resolve({ salt: data.salt, kdfParams: data.kdfParams });
                    });
                    socket.once('salt_not_found', () => {
                        clearTimeout(t);
                        resolve(null);
                    });
                });

                socket.emit('get_salt', username);
                const result = await lookupPromise;
                if (result) {
                    currentSalt = result.salt;
                    currentKdf = result.kdfParams;
                    setServerAccount(result);
                }
            }

            // 3. Key Derivation (Argon2)
            setStatus('Deriving encryption keys (Argon2)...');
            const existingLocalAccount = await db.accounts.where('username').equals(username).first();

            let salt: string = currentSalt || existingLocalAccount?.salt || crypto.randomUUID();
            let kdfParams: any = currentKdf || existingLocalAccount?.kdfParams || { time: 2, mem: 16384, hashLen: 64 };

            const keys = await generateKeys(passphrase, salt);
            const accountUuid = keys.accountUuid;
            const encryptionKey = keys.encryptionKey;

            // Integrity check for local records
            if (existingLocalAccount && accountUuid !== existingLocalAccount.id) {
                throw new Error('Incorrect passphrase for this username.');
            }

            // Save to local DB if it's new
            if (!existingLocalAccount) {
                await db.accounts.put({
                    id: accountUuid,
                    username,
                    salt,
                    kdfParams
                });
            }

            setStatus('Finalizing authentication...');
            // Wait a tiny bit for UI smoothness
            await new Promise(r => setTimeout(r, 500));

            // Authentication successful
            onAuthenticated(accountUuid, encryptionKey, username, salt, kdfParams);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Auth failed. Please try again.');
        } finally {
            setIsLoading(false);
            setStatus('');
        }
    };

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl space-y-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                <div className="text-center space-y-2">
                    <div className={`mx-auto w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-white mb-4`}>
                        <LockIcon size={24} />
                    </div>
                    <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Secure Login</h1>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Zero-Knowledge E2EE Tunnel Initialization
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500'
                                    }`}
                                required
                            />
                            {serverAccount && (
                                <p className="text-[10px] text-green-500 font-bold mt-1 px-1">✓ Account found on server. Salt retrieved.</p>
                            )}
                        </div>
                        <div className="relative">
                            <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="password"
                                placeholder="Passphrase"
                                value={passphrase}
                                onChange={(e) => setPassphrase(e.target.value)}
                                className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500'
                                    }`}
                                required
                            />
                        </div>
                    </div>

                    {status && <p className="text-purple-500 text-[11px] text-center animate-pulse">{status}</p>}
                    {error && <p className="text-red-500 text-xs text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : (serverAccount ? 'Login to Pipeline' : 'Create & Connect')}
                    </button>
                </form>

                <p className={`text-[10px] text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    Encryption keys are generated locally. Your passphrase never leaves your device.
                </p>
            </div>
        </div>
    );
}
