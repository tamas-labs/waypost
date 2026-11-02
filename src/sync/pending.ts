import { and, count, eq, isNull, or } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { chainEntries, media, outbox } from '@/db/schema';

/** What is waiting to be uploaded: chain entries not acknowledged by push, photos not uploaded, outbox calls not sent. */
export interface PendingCounts {
  chain_entries: number;
  media: number;
  outbox: number;
  total: number;
}

/** The photos this phone can still upload: not those of an earlier enrollment, whose upload is closed. */
export function photosOfThisDevice(deviceId: string | null) {
  return deviceId === null ? isNull(media.device_id) : or(eq(media.device_id, deviceId), isNull(media.device_id));
}

export function countPending(db: Database): PendingCounts {
  const deviceId = getKv(db, 'device.id');
  const chain =
    deviceId === null
      ? 0
      : (db
          .select({ n: count() })
          .from(chainEntries)
          .where(and(eq(chainEntries.device_id, deviceId), isNull(chainEntries.synced_at)))
          .get()?.n ?? 0);
  const photos =
    db
      .select({ n: count() })
      .from(media)
      .where(and(isNull(media.uploaded_at), photosOfThisDevice(deviceId)))
      .get()?.n ?? 0;
  const calls = db.select({ n: count() }).from(outbox).get()?.n ?? 0;
  return { chain_entries: chain, media: photos, outbox: calls, total: chain + photos + calls };
}
