'use client';

import { useState } from 'react';
import LoginScreen from './login-screen';
import SignupScreen from './signup-screen';

interface AuthScreenProps {
    onAuthenticated: (uuid: string, key: Uint8Array, username: string, salt?: string, kdfParams?: any) => void;
    isDark: boolean;
}

export default function AuthScreen({ onAuthenticated, isDark }: AuthScreenProps) {
    const [view, setView] = useState<'login' | 'signup'>('login');

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {view === 'login' ? (
                <LoginScreen
                    isDark={isDark}
                    onAuthenticated={onAuthenticated}
                    onSwitchToSignup={() => setView('signup')}
                />
            ) : (
                <SignupScreen
                    isDark={isDark}
                    onAuthenticated={onAuthenticated}
                    onSwitchToLogin={() => setView('login')}
                />
            )}
        </div>
    );
}
