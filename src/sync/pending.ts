import { count, isNull } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { chainEntries, media, outbox } from '@/db/schema';

/** What is waiting to be uploaded: chain entries not acknowledged by push, photos not uploaded, outbox calls not sent. */
export interface PendingCounts {
  chain_entries: number;
  media: number;
  outbox: number;
  total: number;
}

export function countPending(db: Database): PendingCounts {
  const chain = db.select({ n: count() }).from(chainEntries).where(isNull(chainEntries.synced_at)).get()?.n ?? 0;
  const photos = db.select({ n: count() }).from(media).where(isNull(media.uploaded_at)).get()?.n ?? 0;
  const calls = db.select({ n: count() }).from(outbox).get()?.n ?? 0;
  return { chain_entries: chain, media: photos, outbox: calls, total: chain + photos + calls };
}
