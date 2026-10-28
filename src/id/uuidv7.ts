import { getRandomValues } from 'expo-crypto';

/** Fills a byte array with cryptographically secure random values. */
export type RandomFill = (bytes: Uint8Array) => void;

export interface UuidV7Options {
  /** Wall clock in Unix milliseconds. */
  now?: () => number;
  random?: RandomFill;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const COUNTER_MAX = 0xfff;

/**
 * Creates a UUIDv7 generator (RFC 9562): 48-bit Unix millisecond timestamp, 12-bit counter, 62 random bits.
 * The IDs of one generator are strictly increasing, also within a millisecond and when the clock steps back
 * (method 1 of RFC 9562 §6.2: the counter continues from the last timestamp; on overflow the timestamp moves on).
 */
export function createUuidV7(options: UuidV7Options = {}): () => string {
  const now = options.now ?? Date.now;
  const random = options.random ?? ((bytes: Uint8Array) => void getRandomValues(bytes));
  let lastMs = -1;
  let counter = 0;

  return () => {
    const bytes = new Uint8Array(16);
    random(bytes);
    const ms = now();
    if (ms > lastMs) {
      lastMs = ms;
      // A random start below the middle leaves room for at least 2048 IDs within the millisecond.
      counter = ((bytes[6]! << 8) | bytes[7]!) & 0x7ff;
    } else if (counter < COUNTER_MAX) {
      counter += 1;
    } else {
      lastMs += 1;
      counter = 0;
    }
    if (!Number.isSafeInteger(lastMs) || lastMs < 0 || lastMs >= 2 ** 48) throw new Error(`uuidv7: invalid time ${lastMs}`);

    // 48-bit timestamp, big-endian.
    let rest = lastMs;
    for (let i = 5; i >= 0; i -= 1) {
      bytes[i] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | (bytes[8]! & 0x3f);

    const hex = Array.from(bytes, (byte) => HEX[byte]!).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

/** A new UUIDv7, e.g. for every primary key created on the device and every Idempotency-Key. */
export const uuidv7: () => string = createUuidV7();

/** Unix milliseconds encoded in a UUIDv7. */
export function uuidv7Time(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
