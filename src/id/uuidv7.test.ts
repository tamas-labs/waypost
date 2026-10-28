import { schemas } from '@waypost/schema';
import { randomFillSync } from 'node:crypto';

import { createUuidV7, uuidv7, uuidv7Time } from './uuidv7';

const UUID_PATTERN = new RegExp((schemas['common/uuid'] as unknown as { pattern: string }).pattern);
const random = (bytes: Uint8Array) => void randomFillSync(bytes);

describe('uuidv7', () => {
  it('matches the uuid pattern of @waypost/schema and encodes the time', () => {
    const next = createUuidV7({ now: () => Date.UTC(2026, 9, 27, 21, 3, 44, 120), random });
    const id = next();
    expect(id).toMatch(UUID_PATTERN);
    expect(uuidv7Time(id)).toBe(Date.UTC(2026, 9, 27, 21, 3, 44, 120));
  });

  it('works with the default clock and random source', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(UUID_PATTERN);
  });

  it('is strictly increasing within one millisecond, past the counter range', () => {
    const next = createUuidV7({ now: () => 1_793_000_000_000, random });
    const ids = Array.from({ length: 5000 }, () => next());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    // 5000 IDs do not fit into one millisecond's counter: the timestamp moves on.
    expect(uuidv7Time(ids.at(-1)!)).toBeGreaterThan(1_793_000_000_000);
  });

  it('stays increasing when the clock steps back', () => {
    let now = 1_793_000_100_000;
    const next = createUuidV7({ now: () => now, random });
    const first = next();
    now -= 60_000;
    const second = next();
    expect(second > first).toBe(true);
    now += 120_000;
    const third = next();
    expect(third > second).toBe(true);
    expect(uuidv7Time(third)).toBe(now);
  });

  it('sets version 7 and the RFC 9562 variant whatever the random bytes are', () => {
    for (const fill of [0x00, 0xff]) {
      const next = createUuidV7({ now: () => 0, random: (bytes) => bytes.fill(fill) });
      expect(next()).toMatch(UUID_PATTERN);
    }
  });

  it('rejects times a UUIDv7 cannot hold', () => {
    expect(() => createUuidV7({ now: () => -1, random })()).toThrow('uuidv7: invalid time');
    expect(() => createUuidV7({ now: () => 2 ** 48, random })()).toThrow('uuidv7: invalid time');
  });
});
