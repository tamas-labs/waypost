import type { DeviceDiagnosticRequest, ErrorCode, ErrorResponse } from '@waypost/schema';
import { eq } from 'drizzle-orm';

// Types only: what the keys hold. The database does not depend on the domain or the theme when it runs.
import type { PinLockout } from '@/domain/pin-lockout';
import type { ThemePreference } from '@/theme/tokens';

import type { Database } from './database';
import { kv } from './schema';

/** server_time of the last successful sync, with the monotonic clock reading when it was received. */
export interface TimeReference {
  server_time: string;
  uptime_ms: number;
  boot_id: string;
}

/** An outbox call the server refused with a 4xx (sync/outbox.ts), for the supervisor. */
export interface OutboxRejection {
  /** outbox.id of the call. */
  call_id: string;
  method: string;
  path: string;
  status: number;
  code: ErrorCode;
  /** The server's message (Hungarian, safe to show). */
  message: string;
  details: NonNullable<ErrorResponse['error']['details']> | null;
  /** Device wall clock. */
  at: string;
}

/** Every key of the kv table and the type of its value. */
export interface KvValues {
  /** Cursor of the next pull; absent before the first one. */
  'sync.cursor': string;
  /** The ref_* fields of chain entries and the base of the trusted time (time/trusted-time.ts). */
  'sync.time_ref': TimeReference;
  /** Trusted time (time/trusted-time.ts) when the last sync finished without an error. */
  'sync.last_success_at': string;
  /** The highest seq the server has rejected (sync/push.ts): the entries up to it are not sent again. */
  'sync.rejected_through_seq': number;
  /** The report of the rejected entries until the server has it (sync/push.ts). */
  'sync.pending_diagnostic': DeviceDiagnosticRequest;
  /** Trusted time of the last local cleanup (sync/cleanup.ts). */
  'sync.last_cleanup_at': string;
  /** The outbox calls the server refused, until the supervisor has seen them (sync/outbox.ts). */
  'outbox.rejected': OutboxRejection[];
  /** Wrong PINs and the running lock (domain/pin-lockout.ts). */
  'pin.lockout': PinLockout;
  /** ID of this phone as the site phone (devices.id); absent while not enrolled. */
  'device.id': string;
  /** The server answered device_revoked: no more chain entries, the last upload is running (sync/revocation.ts). */
  'device.revoked': true;
  /** The manual theme choice (System / Dark / Light, theme/preference.ts); absent = follow the system. */
  'ui.theme_preference': ThemePreference;
  /** Development builds only: API base URL entered on the developer enrollment screen. */
  'dev.api_base_url': string;
}

export type KvKey = keyof KvValues;

export function getKv<K extends KvKey>(db: Database, key: K): KvValues[K] | null {
  const row = db.select({ value: kv.value }).from(kv).where(eq(kv.key, key)).get();
  return row === undefined ? null : (row.value as KvValues[K]);
}

export function setKv<K extends KvKey>(db: Database, key: K, value: KvValues[K]): void {
  db.insert(kv).values({ key, value }).onConflictDoUpdate({ target: kv.key, set: { value } }).run();
}

export function deleteKv(db: Database, key: KvKey): void {
  db.delete(kv).where(eq(kv.key, key)).run();
}

/** Deletes what the sync keeps about the phone's enrollment: the next device, or none, starts over. */
export function deleteDeviceSyncState(db: Database): void {
  const keys: KvKey[] = ['device.revoked', 'sync.cursor', 'sync.rejected_through_seq', 'sync.pending_diagnostic'];
  for (const key of keys) deleteKv(db, key);
}
