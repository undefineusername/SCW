// Server Time Synchronization Utility
// This helps prevent message ordering issues caused by local clock drift

let serverTimeOffset = 0;

/**
 * Updates the offset between server and local time
 * @param serverTimestamp The timestamp received from the server (number)
 */
export function updateServerTimeOffset(serverTimestamp: number) {
    const localNow = Date.now();
    // server - local = offset
    // so server = local + offset
    serverTimeOffset = serverTimestamp - localNow;

    // Optional: Log major drifts for debugging
    if (Math.abs(serverTimeOffset) > 5000) {
        console.warn(`[TimeSync] Significant clock drift detected: ${serverTimeOffset}ms`);
    }
}

/**
 * Returns the synchronized server time as a Date object
 */
export function getServerTime(): Date {
    return new Date(Date.now() + serverTimeOffset);
}

/**
 * Returns the synchronized server time as a Unix timestamp (ms)
 */
export function getServerTimeNow(): number {
    return Date.now() + serverTimeOffset;
}
