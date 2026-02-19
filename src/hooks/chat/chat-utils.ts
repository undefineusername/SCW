export const DECRYPTION_ERROR_MSG = "[🔒 암호화된 메시지 - Key가 맞지 않음]";
export const NO_KEY_ERROR_MSG = "[🔒 암호화된 메시지 - Key가 설정되지 않음]";

export function isSystemMessage(text: string): boolean {
    try {
        const parsed = JSON.parse(text);
        return parsed && parsed.system === true;
    } catch {
        return false;
    }
}
