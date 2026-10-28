import type { Timestamp } from '@waypost/schema';

import type { Database } from '@/db/database';
import { getKv, setKv, type TimeReference } from '@/db/kv';

import type { ClockReading } from './clock';
import { parseTimestamp, toTimestamp } from './timestamp';

/** The time of an event as far as it can be trusted. */
export interface TrustedTime {
  time: Timestamp;
  /**
   * server: the last server time plus the monotonic time elapsed since (same boot), independent of the wall clock.
   * device: the wall clock, because there is no reference from this boot yet.
   */
  source: 'server' | 'device';
}

/** The ref_* fields of a chain entry. */
export interface ChainTimeReference {
  ref_server_time: Timestamp | null;
  ref_uptime_ms: number | null;
  ref_boot_id: string | null;
}

/** Saves the server_time of a successful sync with the clock reading taken when the response arrived. */
export function recordServerTime(db: Database, serverTime: Timestamp, clock: ClockReading): void {
  parseTimestamp(serverTime);
  setKv(db, 'sync.time_ref', { server_time: serverTime, uptime_ms: clock.uptime_ms, boot_id: clock.boot_id });
}

export function getTimeReference(db: Database): TimeReference | null {
  return getKv(db, 'sync.time_ref');
}

/** The reference fields of a chain entry: the last sync's server time and uptime, whatever boot it came from. */
export function chainTimeReference(ref: TimeReference | null): ChainTimeReference {
  return ref === null
    ? { ref_server_time: null, ref_uptime_ms: null, ref_boot_id: null }
    : { ref_server_time: ref.server_time, ref_uptime_ms: ref.uptime_ms, ref_boot_id: ref.boot_id };
}

/**
 * The trusted time at a clock reading: server time + (uptime − reference uptime) if the reference comes from the
 * same boot (the uptime restarts at every boot), otherwise the wall clock. This is the estimate the server's
 * time_suspect check compares device_time with.
 */
export function estimateTrustedTime(ref: TimeReference | null, clock: ClockReading): TrustedTime {
  if (ref !== null && ref.boot_id === clock.boot_id && clock.uptime_ms >= ref.uptime_ms) {
    return { time: toTimestamp(parseTimestamp(ref.server_time) + clock.uptime_ms - ref.uptime_ms), source: 'server' };
  }
  return { time: clock.device_time, source: 'device' };
}

/** estimateTrustedTime with the reference saved in the database. */
export function trustedTime(db: Database, clock: ClockReading): TrustedTime {
  return estimateTrustedTime(getTimeReference(db), clock);
}
