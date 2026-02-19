import { useEffect } from 'react';
import { db } from '@/lib/db';
import { generateDHKeyPair } from '@/lib/crypto';
import { getSocket } from '@/lib/socket';

export function useChatKeys(
    currentUserUuid: string | null,
    isConnected: boolean,
    user: { username: string; salt?: string; kdfParams?: any } | null
) {
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

            if (account?.dhPublicKey && isConnected) {
                const socket = getSocket();
                // Re-register to ensure server has our public key
                socket.emit('register_master', {
                    uuid: currentUserUuid,
                    username: user!.username,
                    salt: user!.salt,
                    kdfParams: user!.kdfParams,
                    publicKey: account.dhPublicKey
                });
                console.log("📤 Public Key Synced to Server.");
            }
        };
        checkAndSyncKeys();
    }, [currentUserUuid, isConnected, user]);
}
