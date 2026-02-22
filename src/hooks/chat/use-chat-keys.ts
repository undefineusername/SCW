import { useEffect, useRef } from 'react';
import { db } from '@/lib/db';
import { generateDHKeyPair } from '@/lib/crypto';
import { getSocket } from '@/lib/socket';

export function useChatKeys(
    currentUserUuid: string | null,
    isConnected: boolean,
    user: { username: string; salt?: string; kdfParams?: any } | null
) {
    // Keep a ref to user so we can read current values without depending on the object reference
    const userRef = useRef(user);
    userRef.current = user;

    useEffect(() => {
        if (!currentUserUuid) return;

        const checkAndSyncKeys = async () => {
            let account = await db.accounts.get(currentUserUuid);

            if (account && !account.dhPrivateKey) {
                console.log("🔑 Generating new DH Key Pair for", currentUserUuid);
                const keys = await generateDHKeyPair();
                await db.accounts.update(currentUserUuid, {
                    dhPrivateKey: keys.privateKey,
                    dhPublicKey: keys.publicKey
                });
                account = await db.accounts.get(currentUserUuid); // Refresh
                console.log("✅ DH Keys Generated and Saved.");
            }

            if (account?.dhPublicKey && isConnected && userRef.current) {
                const socket = getSocket();
                // Re-register to ensure server has our public key
                socket.emit('register_master', {
                    uuid: currentUserUuid,
                    username: userRef.current.username,
                    salt: userRef.current.salt,
                    kdfParams: userRef.current.kdfParams,
                    publicKey: account.dhPublicKey
                });
                console.log("📤 Public Key Synced to Server.");
            }
        };
        checkAndSyncKeys();
    }, [currentUserUuid, isConnected]); // Removed 'user' object — read via ref instead
}
