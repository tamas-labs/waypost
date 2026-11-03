// A new PIN generated on the phone (specification: PIN-kód, 6 digits). The app generates it, not the server: a create
// repeated by the outbox does not return a PIN the server generated (laravel-waypost: "Az ismételt létrehozás"), and
// the supervisor has to see it before the call goes. The random source is passed in (expo-crypto in the app).

/** Fills a byte array with cryptographically secure random values. */
export type RandomFill = (bytes: Uint8Array) => void;

const PIN_COUNT = 1_000_000;
/** The largest multiple of a million below 2^32: a draw at or above it is drawn again, so every PIN is equally likely. */
const UNBIASED_LIMIT = Math.floor(0x1_0000_0000 / PIN_COUNT) * PIN_COUNT;

/**
 * A PIN anyone would try first: one digit six times (000000), or a run up or down (123456, 987654, 890123 around
 * the end of the digits too).
 */
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((digit, i) => (digit - digits[i]! + 10) % 10));
  return steps.size === 1 && [0, 1, 9].includes([...steps][0]!);
}

/** Six random digits, not a weak PIN. */
export function generatePin(random: RandomFill): string {
  const bytes = new Uint8Array(4);
  for (;;) {
    random(bytes);
    const value = new DataView(bytes.buffer).getUint32(0);
    if (value >= UNBIASED_LIMIT) continue;
    const pin = String(value % PIN_COUNT).padStart(6, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

/** "731 905": a PIN to read out, in two groups. */
export const formatPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`;
