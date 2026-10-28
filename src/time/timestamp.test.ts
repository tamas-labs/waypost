import { schemas } from '@waypost/schema';

import { isTimestamp, nowTimestamp, parseTimestamp, toTimestamp } from './timestamp';

const TIMESTAMP_PATTERN = new RegExp((schemas['common/timestamp'] as unknown as { pattern: string }).pattern);

describe('timestamps', () => {
  it('formats UTC with milliseconds, as @waypost/schema requires', () => {
    expect(toTimestamp(Date.UTC(2026, 9, 27, 21, 3, 44, 120))).toBe('2026-10-27T21:03:44.120Z');
    expect(toTimestamp(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01T00:00:00.000Z');
    expect(nowTimestamp()).toMatch(TIMESTAMP_PATTERN);
  });

  it('rejects times outside the timestamp range', () => {
    expect(() => toTimestamp(Date.UTC(10000, 0, 1))).toThrow('Time out of range');
    expect(() => toTimestamp(Number.NaN)).toThrow('Invalid time');
    expect(() => toTimestamp(1.5)).toThrow('Invalid time');
  });

  it('parses only canonical UTC timestamps', () => {
    expect(parseTimestamp('2026-10-27T21:03:44.120Z')).toBe(Date.UTC(2026, 9, 27, 21, 3, 44, 120));
    for (const bad of ['2026-10-27T21:03:44Z', '2026-10-27T23:03:44.120+02:00', '2026-10-27 21:03:44.120Z', '2026-02-30T00:00:00.000Z', '']) {
      expect(isTimestamp(bad)).toBe(false);
      expect(() => parseTimestamp(bad)).toThrow('Invalid timestamp');
    }
  });
});
