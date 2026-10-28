// The camera reports a code in view on every frame. The filter turns that stream into single reads.
import { isWaypostQr } from './payload';

export type QrScan =
  /** A Waypost code: the payload as read. */
  | { accepted: true; payload: string }
  /** Any other code: ignored by the reader, reported only for the test screen. */
  | { accepted: false; data: string };

export interface QrScanFilterOptions {
  /** A code counts again only after it has been out of view this long. */
  quietMs?: number;
  /** Monotonic time in ms. */
  now?: () => number;
}

export const DEFAULT_QUIET_MS = 2000;

/**
 * Returns a function that takes each code the camera reports and gives back a read, or null if the code is still
 * in view since its last read. Several codes in view at the same time are tracked separately.
 */
export function createQrScanFilter({ quietMs = DEFAULT_QUIET_MS, now = () => performance.now() }: QrScanFilterOptions = {}) {
  const lastSeen = new Map<string, number>();
  return (data: string): QrScan | null => {
    const at = now();
    for (const [seen, seenAt] of lastSeen) {
      if (at - seenAt >= quietMs) lastSeen.delete(seen);
    }
    const inView = lastSeen.has(data);
    lastSeen.set(data, at);
    if (inView) return null;
    return isWaypostQr(data) ? { accepted: true, payload: data } : { accepted: false, data };
  };
}
