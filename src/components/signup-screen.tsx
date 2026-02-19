'use client';

import { useState } from 'react';
import { generateKeys } from '@/lib/crypto';
import { getSocket, waitForConnection } from '@/lib/socket';
import { db } from '@/lib/db';
import { Lock as LockIcon, User, Loader2, UserPlus } from 'lucide-react';

interface SignupScreenProps {
    onAuthenticated: (uuid: string, key: Uint8Array, username: string, salt?: string, kdfParams?: any) => void;
    onSwitchToLogin: () => void;
    isDark: boolean;
}

export default function SignupScreen({ onAuthenticated, onSwitchToLogin, isDark }: SignupScreenProps) {
    const [username, setUsername] = useState('');
    const [passphrase, setPassphrase] = useState('');
    const [confirmPassphrase, setConfirmPassphrase] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !passphrase) return;

        if (passphrase !== confirmPassphrase) {
            setError('Passphrases do not match.');
            return;
        }

        setIsLoading(true);
        setError('');
        setStatus('Initializing secure tunnel...');

        try {
            const socket = getSocket();

            // 1. Connection check
            setStatus('Connecting to relay server...');
            const connected = await waitForConnection(5000);
            if (!connected) {
                throw new Error('Relay server is unreachable.');
            }

            // 2. Check if username exists
            setStatus('Checking username availability...');
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

            if (serverAccount) {
                throw new Error('Username already taken. Please choose another or login.');
            }

            // 3. New Account Generation
            setStatus('Deriving zero-knowledge keys...');
            const salt = crypto.randomUUID();
            const kdfParams = { time: 2, mem: 16384, hashLen: 64 };
            const keys = await generateKeys(passphrase, salt);

            const accountUuid = keys.accountUuid;
            const encryptionKey = keys.encryptionKey;

            // 4. Register on Local DB
            await db.accounts.put({
                id: accountUuid,
                username,
                salt,
                kdfParams
            });

            setStatus('Account ready locally...');
            await new Promise(r => setTimeout(r, 500));

            // Authentication successful (Registration happens on first relay message/register_master call in useChat)
            onAuthenticated(accountUuid, encryptionKey, username, salt, kdfParams);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Signup failed. Please try again.');
        } finally {
            setIsLoading(false);
            setStatus('');
        }
    };

    return (
        <div className={`w-full max-w-md p-8 rounded-2xl shadow-xl space-y-8 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="text-center space-y-2">
                <div className={`mx-auto w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center text-white mb-4 shadow-lg shadow-green-500/20`}>
                    <UserPlus size={24} />
                </div>
                <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} tracking-tight`}>Create Account</h1>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Initialize your private E2EE identity
                </p>
            </div>

            <form onSubmit={handleSignup} className="space-y-6">
                <div className="space-y-4">
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Choose Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                }`}
                            required
                        />
                    </div>
                    <div className="relative">
                        <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="password"
                            placeholder="Create Passphrase"
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                }`}
                            required
                        />
                    </div>
                    <div className="relative">
                        <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="password"
                            placeholder="Confirm Passphrase"
                            value={confirmPassphrase}
                            onChange={(e) => setConfirmPassphrase(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                                }`}
                            required
                        />
                    </div>
                </div>

                {status && <p className="text-green-500 text-[11px] text-center font-medium animate-pulse">{status}</p>}
                {error && <p className="text-red-500 text-xs text-center font-medium bg-red-500/10 py-2 rounded-lg">{error}</p>}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold shadow-lg shadow-green-500/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
                </button>
            </form>

            <div className="text-center">
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Already have an account?{' '}
                    <button
                        onClick={onSwitchToLogin}
                        className="text-green-500 hover:text-green-600 font-semibold"
                    >
                        Log In
                    </button>
                </p>
            </div>

            <div className={`p-4 rounded-xl text-[10px] ${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-500'} leading-relaxed`}>
                <p className="font-bold mb-1 flex items-center gap-1">
                    <LockIcon size={10} /> SECURITY NOTICE:
                </p>
                This app uses <strong>Zero-Knowledge Encryption</strong>. Your passphrase is never sent to the server. If you lose your passphrase, your account cannot be recovered.
            </div>
        </div>
    );
}
