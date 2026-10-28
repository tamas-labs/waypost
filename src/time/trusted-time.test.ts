import { createTestDatabase } from '@/db/testing';

import type { ClockReading } from './clock';
import { chainTimeReference, estimateTrustedTime, getTimeReference, recordServerTime, trustedTime } from './trusted-time';

const SYNC_CLOCK: ClockReading = { device_time: '2026-10-27T19:58:10.000Z', uptime_ms: 82_500_000, boot_id: 'android-boot:12' };
const REF = { server_time: '2026-10-27T19:58:02.511Z', uptime_ms: 82_500_000, boot_id: 'android-boot:12' };

describe('trusted time', () => {
  it('saves the server time with the clock reading of the sync', async () => {
    const { db } = await createTestDatabase();
    expect(getTimeReference(db)).toBeNull();
    recordServerTime(db, '2026-10-27T19:58:02.511Z', SYNC_CLOCK);
    expect(getTimeReference(db)).toEqual(REF);
    expect(() => recordServerTime(db, '2026-10-27T19:58:02Z', SYNC_CLOCK)).toThrow('Invalid timestamp');
  });

  it('adds the elapsed uptime to the server time within the same boot, whatever the wall clock says', () => {
    // 3 900 123 ms later; the wall clock was set back by a day, the estimate does not follow it.
    const later: ClockReading = { device_time: '2026-10-26T21:03:44.120Z', uptime_ms: 86_400_123, boot_id: 'android-boot:12' };
    expect(estimateTrustedTime(REF, later)).toEqual({ time: '2026-10-27T21:03:02.634Z', source: 'server' });
  });

  it('falls back to the wall clock without a reference from this boot', () => {
    const afterReboot: ClockReading = { device_time: '2026-10-27T22:00:00.000Z', uptime_ms: 60_000, boot_id: 'android-boot:13' };
    expect(estimateTrustedTime(REF, afterReboot)).toEqual({ time: '2026-10-27T22:00:00.000Z', source: 'device' });
    expect(estimateTrustedTime(null, afterReboot)).toEqual({ time: '2026-10-27T22:00:00.000Z', source: 'device' });
    // An uptime below the reference cannot happen within one boot; the reference is not used.
    expect(estimateTrustedTime(REF, { ...afterReboot, boot_id: 'android-boot:12' }).source).toBe('device');
  });

  it('reads the reference from the database', async () => {
    const { db } = await createTestDatabase();
    const clock: ClockReading = { device_time: '2026-10-27T20:00:00.000Z', uptime_ms: 82_510_000, boot_id: 'android-boot:12' };
    expect(trustedTime(db, clock).source).toBe('device');
    recordServerTime(db, REF.server_time, SYNC_CLOCK);
    expect(trustedTime(db, clock)).toEqual({ time: '2026-10-27T19:58:12.511Z', source: 'server' });
  });

  it('gives the ref_* fields of a chain entry, also from an earlier boot', () => {
    expect(chainTimeReference(null)).toEqual({ ref_server_time: null, ref_uptime_ms: null, ref_boot_id: null });
    expect(chainTimeReference(REF)).toEqual({ ref_server_time: REF.server_time, ref_uptime_ms: REF.uptime_ms, ref_boot_id: REF.boot_id });
  });
});
