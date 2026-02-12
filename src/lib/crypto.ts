import Argon2Worker from './argon2.worker?worker';

// Constants for AES-GCM
const ALGO = 'AES-GCM';
const IV_LENGTH = 12;

export async function generateKeys(passphrase: string, salt: string): Promise<{ accountUuid: string; encryptionKey: Uint8Array; hashHex: string }> {
    if (typeof window === 'undefined') return { accountUuid: '', encryptionKey: new Uint8Array(), hashHex: '' };

    const saltUint8 = new TextEncoder().encode(salt);

    return new Promise((resolve, reject) => {
        const worker = new Argon2Worker();

        worker.onmessage = (e) => {
            const { success, hashResult, error } = e.data;
            if (success) {
                const hashBytes = hashResult.hash as Uint8Array;
                const uuidPart = hashBytes.slice(0, 32);
                const keyPart = hashBytes.slice(32, 64);

                const accountUuid = Array.from(uuidPart).map((b: any) => b.toString(16).padStart(2, '0')).join('');

                resolve({
                    accountUuid,
                    encryptionKey: keyPart,
                    hashHex: accountUuid // Use UUID as the display hash
                });
            } else {
                reject(new Error(error));
            }
            worker.terminate();
        };

        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
        };

        worker.postMessage({ passphrase, saltUint8 });
    });
}

export async function encryptMessage(text: string, key: Uint8Array): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        ALGO,
        false,
        ['encrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
        { name: ALGO, iv: iv as BufferSource },
        cryptoKey,
        data as BufferSource
    );

    // Combine IV and Encrypted Search for transmission
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return combined;
}

export async function decryptMessage(combined: Uint8Array, key: Uint8Array): Promise<string> {
    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key as BufferSource,
        ALGO,
        false,
        ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: ALGO, iv: iv as BufferSource },
        cryptoKey,
        data as BufferSource
    );

    return new TextDecoder().decode(decrypted);
}
export async function deriveKeyFromSecret(secret: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyData = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
    return new Uint8Array(keyData);
}
