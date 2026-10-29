import { FIRST_LOCK_MS, lockStatus, NO_LOCKOUT, registerFailure, type PinLockout } from './pin-lockout';

const at = (uptime_ms: number, boot_id = 'android-boot:12') => ({ uptime_ms, boot_id });

/** n wrong PINs in a row at uptime t, each after the previous lock expired. */
function failures(n: number, t = 0): PinLockout {
  let lockout = NO_LOCKOUT;
  let now = t;
  for (let i = 0; i < n; i++) {
    lockout = lockStatus(lockout, at(now)).lockout;
    lockout = registerFailure(lockout, at(now));
    now += lockout.lock?.duration_ms ?? 0;
  }
  return lockout;
}

describe('PIN lockout', () => {
  it('does not lock before the 5th wrong PIN', () => {
    expect(failures(4)).toEqual({ failures: 4, lock: null });
    expect(lockStatus(failures(4), at(10)).remaining_ms).toBe(0);
  });

  it('locks for 5 minutes at the 5th wrong PIN, on the monotonic clock', () => {
    const lockout = failures(5, 1000);
    expect(lockout).toEqual({ failures: 5, lock: { duration_ms: FIRST_LOCK_MS, started_uptime_ms: 1000, boot_id: 'android-boot:12' } });
    expect(lockStatus(lockout, at(1000)).remaining_ms).toBe(FIRST_LOCK_MS);
    expect(lockStatus(lockout, at(1000 + FIRST_LOCK_MS - 1)).remaining_ms).toBe(1);
    const expired = lockStatus(lockout, at(1000 + FIRST_LOCK_MS));
    expect(expired).toEqual({ lockout: { failures: 5, lock: null }, remaining_ms: 0 });
  });

  it('doubles the lock at every further wrong PIN', () => {
    expect([5, 6, 7, 8].map((n) => failures(n).lock?.duration_ms)).toEqual([FIRST_LOCK_MS, 2 * FIRST_LOCK_MS, 4 * FIRST_LOCK_MS, 8 * FIRST_LOCK_MS]);
    expect(failures(200).lock?.duration_ms).toBe(FIRST_LOCK_MS * 2 ** 30);
  });

  it('starts a running lock again with its full duration after a restart (Q6)', () => {
    const lockout = failures(6, 5_000_000);
    const afterRestart = lockStatus(lockout, at(40_000, 'android-boot:13'));
    expect(afterRestart).toEqual({ lockout: { failures: 6, lock: { duration_ms: 2 * FIRST_LOCK_MS, started_uptime_ms: 40_000, boot_id: 'android-boot:13' } }, remaining_ms: 2 * FIRST_LOCK_MS });
    expect(lockStatus(afterRestart.lockout, at(40_000 + FIRST_LOCK_MS, 'android-boot:13')).remaining_ms).toBe(FIRST_LOCK_MS);
    // An uptime that went back on the same boot ID is treated the same way.
    expect(lockStatus(lockout, at(0)).remaining_ms).toBe(2 * FIRST_LOCK_MS);
  });
});
