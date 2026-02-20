'use client';

import { useState } from 'react';
import { generateKeys } from '@/lib/crypto';
import { getSocket, waitForConnection } from '@/lib/socket';
import { db } from '@/lib/db';
import { Lock as LockIcon, User, Loader2 } from 'lucide-react';

interface LoginScreenProps {
    onAuthenticated: (uuid: string, key: Uint8Array, username: string, salt?: string, kdfParams?: any) => void;
    onSwitchToSignup: () => void;
    isDark: boolean;
}

export default function LoginScreen({ onAuthenticated, onSwitchToSignup, isDark }: LoginScreenProps) {
    const [username, setUsername] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

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

            // 2. Lookup salt
            setStatus('Retrieving account metadata...');
            const lookupPromise = new Promise<{ uuid: string; salt: string; kdfParams: any } | null>((resolve) => {
                const t = setTimeout(() => {
                    socket.off('salt_found');
                    socket.off('salt_not_found');
                    resolve(null);
                }, 3000);

                socket.once('salt_found', (data: { uuid: string; salt: string; kdfParams: any }) => {
                    clearTimeout(t);
                    resolve({ uuid: data.uuid, salt: data.salt, kdfParams: data.kdfParams });
                });
                socket.once('salt_not_found', () => {
                    clearTimeout(t);
                    resolve(null);
                });
            });

            socket.emit('get_salt', username);
            const serverAccount = await lookupPromise;

            if (!serverAccount) {
                throw new Error('Account not found on server. Please sign up first.');
            }

            // 3. Key Derivation (Argon2)
            setStatus('Deriving encryption keys (Argon2)...');
            const keys = await generateKeys(passphrase, serverAccount.salt);
            const accountUuid = keys.accountUuid;
            const encryptionKey = keys.encryptionKey;

            // Integrity Check: Server (Prevent accidental login with wrong pass creating wrong UUID)
            if (accountUuid !== serverAccount.uuid) {
                throw new Error('Incorrect passphrase for this username.');
            }

            // Save/Update to local DB
            await db.accounts.put({
                id: accountUuid,
                username,
                salt: serverAccount.salt,
                kdfParams: serverAccount.kdfParams
            });

            setStatus('Finalizing authentication...');
            await new Promise(r => setTimeout(r, 500));

            // Authentication successful
            onAuthenticated(accountUuid, encryptionKey, username, serverAccount.salt, serverAccount.kdfParams);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setIsLoading(false);
            setStatus('');
        }
    };

    return (
        <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl space-y-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="text-center space-y-2">
                <div className={`mx-auto w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center text-white mb-4 shadow-lg shadow-purple-500/20`}>
                    <LockIcon size={24} />
                </div>
                <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>Welcome Back</h1>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Secure login to your E2EE workspace
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
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                                }`}
                            required
                        />
                    </div>
                    <div className="relative">
                        <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="password"
                            placeholder="Passphrase"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
                                }`}
                            required
                        />
                    </div>
                </div>

                {status && <p className="text-purple-500 text-[11px] text-center font-medium animate-pulse">{status}</p>}
                {error && <p className="text-red-500 text-xs text-center font-medium bg-red-500/10 py-2 rounded-lg">{error}</p>}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-lg shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Login'}
                </button>
            </form>

            <div className="text-center">
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Don't have an account?{' '}
                    <button
                        onClick={onSwitchToSignup}
                        className="text-purple-500 hover:text-purple-600 font-semibold"
                    >
                        Sign Up
                    </button>
                </p>
            </div>

            <p className={`text-[10px] text-center ${isDark ? 'text-gray-500' : 'text-gray-400'} pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                Zero-Knowledge Auth: Your passphrase is never sent to the server.
            </p>
        </div>
    );
}
