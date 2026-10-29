// PIN lockout (specification: Azonosítás / PIN-kód): after 5 wrong PINs a 5-minute lock, doubled at every further
// wrong PIN. The time is measured on the monotonic clock (uptime), not the wall clock. The uptime restarts at boot,
// so after a restart (another boot ID) a running lock starts again with its full duration (Q6): a restart does not
// shorten it.
import type { ClockReading } from '@/time/clock';

export const LOCK_AFTER_FAILURES = 5;
export const FIRST_LOCK_MS = 5 * 60_000;

export interface PinLockout {
  /** Wrong PINs since the last successful login. */
  failures: number;
  lock: { duration_ms: number; started_uptime_ms: number; boot_id: string } | null;
}

export const NO_LOCKOUT: PinLockout = { failures: 0, lock: null };

export interface LockStatus {
  /** The lockout to store (a lock carried over a restart starts again; an expired one is dropped). */
  lockout: PinLockout;
  /** 0 when PINs may be entered. */
  remaining_ms: number;
}

type Clock = Pick<ClockReading, 'uptime_ms' | 'boot_id'>;

export function lockStatus(lockout: PinLockout, clock: Clock): LockStatus {
  const { lock } = lockout;
  if (lock === null) return { lockout, remaining_ms: 0 };
  if (lock.boot_id !== clock.boot_id || clock.uptime_ms < lock.started_uptime_ms) {
    return { lockout: { ...lockout, lock: { ...lock, started_uptime_ms: clock.uptime_ms, boot_id: clock.boot_id } }, remaining_ms: lock.duration_ms };
  }
  const remaining = lock.started_uptime_ms + lock.duration_ms - clock.uptime_ms;
  return remaining > 0 ? { lockout, remaining_ms: remaining } : { lockout: { ...lockout, lock: null }, remaining_ms: 0 };
}

/** A wrong PIN (entered while not locked): the 5th locks for 5 minutes, every further one for twice as long as the last. */
export function registerFailure(lockout: PinLockout, clock: Clock): PinLockout {
  const failures = lockout.failures + 1;
  if (failures < LOCK_AFTER_FAILURES) return { failures, lock: null };
  const duration_ms = FIRST_LOCK_MS * 2 ** Math.min(failures - LOCK_AFTER_FAILURES, 30);
  return { failures, lock: { duration_ms, started_uptime_ms: clock.uptime_ms, boot_id: clock.boot_id } };
}
