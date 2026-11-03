import { formatPin, generatePin, isWeakPin } from './pin-generate';

/** A random source giving these 32-bit values, one per draw. */
function draws(...values: number[]) {
  let i = 0;
  return (bytes: Uint8Array) => {
    const value = values[i++];
    if (value === undefined) throw new Error('No more draws');
    new DataView(bytes.buffer).setUint32(0, value);
  };
}

test('six digits, with leading zeros', () => {
  expect(generatePin(draws(731_905))).toBe('731905');
  expect(generatePin(draws(4_000_042))).toBe('000042');
});

test('a draw from the incomplete last million is drawn again, so every PIN is equally likely', () => {
  expect(generatePin(draws(4_294_000_000, 0xffff_ffff, 482_913))).toBe('482913');
  // The last complete million is used: 4 293 482 913 → 482913.
  expect(generatePin(draws(4_293_482_913))).toBe('482913');
});

test('a weak PIN is drawn again', () => {
  expect(generatePin(draws(111_111, 123_456, 987_654, 482_913))).toBe('482913');
});

test('weak PINs: one digit six times, runs up and down, also around the end of the digits', () => {
  for (const pin of ['000000', '777777', '123456', '012345', '456789', '890123', '987654', '210987', '543210'])
    expect(isWeakPin(pin)).toBe(true);
  for (const pin of ['731905', '112233', '135791', '123457', '000001', '246802']) expect(isWeakPin(pin)).toBe(false);
});

test('read out in two groups', () => {
  expect(formatPin('731905')).toBe('731 905');
});
