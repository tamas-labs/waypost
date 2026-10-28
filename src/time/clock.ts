import { getBootId, getUptimeMs } from '@modules/waypost-clock';
import type { Timestamp } from '@waypost/schema';

import { toTimestamp } from './timestamp';

/** The device's three clocks read at the same moment: what a chain entry records about time. */
export interface ClockReading {
  /** Wall clock, adjustable by the user. */
  device_time: Timestamp;
  /** Monotonic milliseconds since boot, including sleep. */
  uptime_ms: number;
  boot_id: string;
}

export type ReadClock = () => ClockReading;

let bootId: string | null = null;

/** Reads the wall clock and the waypost-clock module (the boot ID cannot change while the app runs, so it is read once). */
export const readClock: ReadClock = () => {
  bootId ??= getBootId();
  return { device_time: toTimestamp(Date.now()), uptime_ms: getUptimeMs(), boot_id: bootId };
};
