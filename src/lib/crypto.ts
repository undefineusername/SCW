import Argon2Worker from './argon2.worker?worker';

// Constants for AES-GCM
const ALGO = 'AES-GCM';
const IV_LENGTH = 12;

// ECDH Constants
const ECDH_ALGO = {
    name: "ECDH",
    namedCurve: "P-384"
};

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

// --- ECDH (Diffie-Hellman) Implementation ---

export async function generateDHKeyPair(): Promise<{ privateKey: JsonWebKey; publicKey: JsonWebKey }> {
    const keyPair = await crypto.subtle.generateKey(
        ECDH_ALGO,
        true,
        ["deriveKey", "deriveBits"]
    );

    const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    return { privateKey, publicKey };
}

export async function exportPublicKeyToRaw(publicKeyJwk: JsonWebKey): Promise<Uint8Array> {
    const publicKey = await crypto.subtle.importKey(
        "jwk",
        publicKeyJwk,
        ECDH_ALGO,
        true,
        []
    );
    const raw = await crypto.subtle.exportKey("raw", publicKey);
    return new Uint8Array(raw);
}

export async function importPublicKeyFromRaw(raw: Uint8Array): Promise<JsonWebKey> {
    const publicKey = await crypto.subtle.importKey(
        "raw",
        raw as any,
        ECDH_ALGO,
        true,
        []
    );
    return await crypto.subtle.exportKey("jwk", publicKey);
}

async function startDerive(privateKeyJwk: JsonWebKey, publicKey: CryptoKey): Promise<string> {
    if (!privateKeyJwk || typeof privateKeyJwk !== 'object' || Array.isArray(privateKeyJwk)) {
        console.error("❌ Invalid privateKeyJwk passed to startDerive:", privateKeyJwk);
        throw new Error("Invalid privateKeyJwk: must be a JWK object");
    }

    try {
        const privateKey = await crypto.subtle.importKey(
            "jwk",
            privateKeyJwk,
            ECDH_ALGO,
            false,
            ["deriveBits"]
        );

        const sharedBits = await crypto.subtle.deriveBits(
            {
                name: "ECDH",
                public: publicKey
            },
            privateKey,
            384
        );

        const hashBuffer = await crypto.subtle.digest("SHA-256", sharedBits);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        // Provide a safer Base64 string (URL safe not strictly needed but good practice, here we stick to standard)
        const hashString = btoa(String.fromCharCode.apply(null, hashArray));

        return hashString;
    } catch (err) {
        console.error("❌ Failed in startDerive (importKey or deriveBits):", err);
        throw err;
    }
}

export async function deriveSharedSecret(
    privateKeyJwk: JsonWebKey,
    publicKeyJwk: JsonWebKey
): Promise<string> {
    if (!publicKeyJwk || typeof publicKeyJwk !== 'object' || Array.isArray(publicKeyJwk)) {
        console.error("❌ Invalid publicKeyJwk passed to deriveSharedSecret:", publicKeyJwk);
        throw new Error("Invalid publicKeyJwk: must be a JWK object");
    }

    try {
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            publicKeyJwk,
            ECDH_ALGO,
            false,
            []
        );
        return startDerive(privateKeyJwk, publicKey);
    } catch (err) {
        console.error("❌ Failed to import public key from JWK:", err);
        throw err;
    }
}

export async function deriveSharedSecretFromRaw(
    privateKeyJwk: JsonWebKey,
    publicKeyRaw: Uint8Array
): Promise<string> {
    if (!publicKeyRaw || !((publicKeyRaw as any) instanceof Uint8Array || (publicKeyRaw as any) instanceof ArrayBuffer)) {
        console.error("❌ Invalid publicKeyRaw passed to deriveSharedSecretFromRaw:", publicKeyRaw);
        throw new Error("Invalid publicKeyRaw: must be Uint8Array or ArrayBuffer");
    }

    try {
        const publicKey = await crypto.subtle.importKey(
            "raw",
            publicKeyRaw as any,
            ECDH_ALGO,
            false,
            []
        );
        return startDerive(privateKeyJwk, publicKey);
    } catch (err) {
        console.error("❌ Failed to import public key from raw:", err);
        throw err;
    }
}

// --------------------------------------------

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
