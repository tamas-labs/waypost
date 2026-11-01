import { createTestDatabase } from '@/db/testing';

import type { ClockReading } from './clock';
import { trustedNowMs } from './trusted-now';
import { recordServerTime } from './trusted-time';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const NOW = '2026-10-27T19:58:10.000Z';
const readClock = (): ClockReading => ({ device_time: NOW, uptime_ms: 1000, boot_id: 'android-boot:12' });

it('counts with the wall clock without a reference, then with the trusted time', async () => {
  const { db } = await createTestDatabase();
  expect(trustedNowMs(db, readClock)).toBe(Date.parse(NOW));

  recordServerTime(db, '2026-10-27T20:00:00.000Z', readClock());
  expect(trustedNowMs(db, readClock)).toBe(Date.parse('2026-10-27T20:00:00.000Z'));
});
