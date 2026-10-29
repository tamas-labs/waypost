import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';
import { chainEntries, media, outbox } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import { countPending } from './pending';
import { setSyncNowHandler, syncErrorKind, useSyncStatus } from './status';

describe('sync status', () => {
  it('tells the kinds of sync errors apart', () => {
    expect(syncErrorKind(new NetworkError(false))).toBe('network');
    expect(syncErrorKind(new InvalidResponseError(200, 'not JSON'))).toBe('invalid_response');
    expect(syncErrorKind(new ApiError(401, 'unauthenticated', 'Lejárt token.'))).toBe('unauthenticated');
    expect(syncErrorKind(new ApiError(401, 'device_revoked', 'Visszavonva.'))).toBe('device_revoked');
    expect(syncErrorKind(new ApiError(429, 'rate_limited', 'Túl sok kérés.'))).toBe('rate_limited');
    expect(syncErrorKind(new ApiError(503, 'server_error', 'HTTP 503'))).toBe('server');
    expect(syncErrorKind(new ApiError(422, 'validation_failed', 'Hibás kurzor.'))).toBe('server');
    expect(syncErrorKind(new Error('?'))).toBe('unknown');
  });

  it('runs "Sync now" through the connected handler', async () => {
    await expect(useSyncStatus.getState().syncNow()).resolves.toEqual({ status: 'skipped' });
    const handler = jest.fn(async () => ({ status: 'ok' as const }));
    setSyncNowHandler(handler);
    await expect(useSyncStatus.getState().syncNow()).resolves.toEqual({ status: 'ok' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('counts unacknowledged chain entries, photos not uploaded and outbox calls as pending', async () => {
    const { db } = await createTestDatabase();
    expect(countPending(db)).toEqual({ chain_entries: 0, media: 0, outbox: 0, total: 0 });

    const entry = {
      device_id: '019a2b3c-4d5e-7f00-8a00-000000000004',
      type: 'shift_started' as const,
      payload: { shift_id: '019a2b3c-4d5e-7f00-8a00-0000000000b1', site_id: '019a2b3c-4d5e-7f00-8a00-000000000001', guard_id: '019a2b3c-4d5e-7f00-8a00-000000000003' },
      device_time: '2026-10-27T20:00:00.000Z',
      uptime_ms: 1000,
      boot_id: 'android-boot:12',
      prev_hash: '0'.repeat(64),
      hash: 'a'.repeat(64),
    };
    db.insert(chainEntries)
      .values([
        { ...entry, id: '019a2b3c-4d5e-7f00-8a00-0000000000c1', seq: 1, synced_at: '2026-10-27T20:00:05.000Z' },
        { ...entry, id: '019a2b3c-4d5e-7f00-8a00-0000000000c2', seq: 2 },
      ])
      .run();
    const photo = { owner_type: 'scan' as const, owner_id: 'x', sha256: 'b'.repeat(64), mime: 'image/jpeg', size_bytes: 1, local_uri: 'file:///p.jpg', taken_at: '2026-10-27T20:00:00.000Z' };
    db.insert(media)
      .values([
        { ...photo, id: '019a2b3c-4d5e-7f00-8a00-0000000000d1' },
        { ...photo, id: '019a2b3c-4d5e-7f00-8a00-0000000000d2', uploaded_at: '2026-10-27T20:01:00.000Z' },
      ])
      .run();
    db.insert(outbox)
      .values({ id: '019a2b3c-4d5e-7f00-8a00-0000000000e1', method: 'POST', path: '/sites', body: {}, idempotency_key: '019a2b3c-4d5e-7f00-8a00-0000000000e2', created_at: '2026-10-27T20:00:00.000Z' })
      .run();

    expect(countPending(db)).toEqual({ chain_entries: 1, media: 1, outbox: 1, total: 3 });
  });
});
