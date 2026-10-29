// waypost-clock: the device's monotonic clock and boot ID for chain entries (uptime_ms, boot_id), and the GNSS time
// of the last GPS fix (gnss_time).
import WaypostClock from './src/WaypostClockModule';

/** Same pattern as boot_id in @waypost/schema chain/entry.json. */
const BOOT_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/**
 * Milliseconds since the device booted, including the time it was asleep; never goes back within a boot.
 * Android: SystemClock.elapsedRealtime(); iOS: CLOCK_MONOTONIC.
 */
export function getUptimeMs(): number {
  const value = WaypostClock.getUptimeMs();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`waypost-clock: invalid uptime ${value}`);
  return value;
}

/**
 * Identifier of the current boot; changes on every restart. The prefix tells its source:
 * android-boot:<BOOT_COUNT>, android-kernel:<boot_id>, ios-session:<kern.bootsessionuuid>, ios-boottime:<kern.boottime>.
 */
export function getBootId(): string {
  const value = WaypostClock.getBootId();
  if (!BOOT_ID.test(value)) throw new Error(`waypost-clock: invalid boot ID ${value}`);
  return value;
}

/**
 * Android: the time (epoch ms) of the last fix of the GPS provider as the GNSS receiver reported it, if that fix is
 * at most maxAgeMs old by the monotonic clock; null otherwise, without the location permission, and always on iOS.
 */
export function getGnssTimeMs(maxAgeMs: number): number | null {
  const value = WaypostClock.getGnssTimeMs(maxAgeMs);
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`waypost-clock: invalid GNSS time ${value}`);
  return value;
}
