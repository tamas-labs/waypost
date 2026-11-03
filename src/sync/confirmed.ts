// The records the server has just confirmed to this phone (an outbox call's 2xx, the phone's own device at enrollment),
// which a full state of the next minute does not delete (sync/pull.ts). The server's pull holds back the changes of
// the last seconds (laravel-waypost Pull::SETTLE_MS), so a full state right after them lacks them; they come with the
// next pull. Both times are the server's.
import type { Database } from '@/db/database';
import { getKv, setKv, type ConfirmedRecords } from '@/db/kv';

/**
 * How long (server time) a full state keeps the records the server confirmed: longer than the server holds back the
 * latest changes (laravel-waypost Pull::SETTLE_MS, 5 s), else a site created on this phone would disappear from it for
 * a sync interval when the pull right after its call starts a full state (a new site changes the supervisor's sites).
 */
export const CONFIRMED_KEPT_MS = 60_000;

function stillKept(entries: readonly ConfirmedRecords[], serverTime: string): ConfirmedRecords[] {
  const now = Date.parse(serverTime);
  return entries.filter((entry) => now - Date.parse(entry.server_time) < CONFIRMED_KEPT_MS);
}

/**
 * Remembers local records the server has just confirmed (an outbox call's 2xx, the phone's own device at enrollment),
 * so that a full state of the next minute does not delete them (CONFIRMED_KEPT_MS).
 */
export function rememberConfirmed(tx: Database, ids: readonly string[], serverTime: string): void {
  if (ids.length === 0) return;
  const kept = stillKept(getKv(tx, 'sync.confirmed') ?? [], serverTime);
  setKv(tx, 'sync.confirmed', [...kept, { ids: [...ids], server_time: serverTime }]);
}

/** The records a full state with this server_time does not delete. */
export function confirmedRecordIds(tx: Database, serverTime: string): string[] {
  return stillKept(getKv(tx, 'sync.confirmed') ?? [], serverTime).flatMap((entry) => entry.ids);
}
