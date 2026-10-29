import { eq } from 'drizzle-orm';

import type { PinLockout } from '@/domain/pin-lockout';
import type { ThemePreference } from '@/theme/theme-provider';

import type { Database } from './database';
import { kv } from './schema';

/** server_time of the last successful sync, with the monotonic clock reading when it was received. */
export interface TimeReference {
  server_time: string;
  uptime_ms: number;
  boot_id: string;
}

/** Every key of the kv table and the type of its value. */
export interface KvValues {
  /** Cursor of the next pull; absent before the first one. */
  'sync.cursor': string;
  /** The ref_* fields of chain entries and the base of the trusted time (time/trusted-time.ts). */
  'sync.time_ref': TimeReference;
  /** Trusted time (time/trusted-time.ts) when the last sync finished without an error. */
  'sync.last_success_at': string;
  /** Wrong PINs and the running lock (domain/pin-lockout.ts). */
  'pin.lockout': PinLockout;
  /** ID of this phone as the site phone (devices.id); absent while not enrolled. */
  'device.id': string;
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
