import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';

self.onmessage = async (e) => {
    const { passphrase, saltUint8 } = e.data;

    try {
        const hashResult = await argon2.hash({
            pass: passphrase,
            salt: saltUint8,
            time: 2,
            mem: 16384,
            hashLen: 64,
            parallelism: 1,
            type: argon2.ArgonType.Argon2id
        });

        self.postMessage({ success: true, hashResult });
    } catch (error: any) {
        self.postMessage({ success: false, error: error.message || String(error) });
    }
};
