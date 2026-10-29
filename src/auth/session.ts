import type { Timestamp } from '@waypost/schema';
import { create } from 'zustand';

import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';

import { deleteDeviceCredentials, deleteSupervisorToken, getDeviceCredentials, getSupervisorToken } from './credentials';
import { resolveStartup, type DeviceMode } from './startup';

/** The user logged in with a PIN on the site phone. */
export interface ActiveUser {
  id: string;
  role: 'guard' | 'supervisor';
}

/** A guard has just started a shift (or taken one over): the shift start screen (G2) comes before the shift home. */
export interface ShiftStartNotice {
  /** The shift closed by the handover: whose, and when. */
  handover: { guard_name: string; at: Timestamp } | null;
}

export interface SessionState {
  /** Null until loadSession() has run. */
  mode: DeviceMode | null;
  deviceId: string | null;
  /** Site phone only; set by the PIN login (M3-15), cleared at logout. */
  activeUser: ActiveUser | null;
  /** Set by a guard's login that started a shift; cleared when the guard goes on to the shift home, and at logout. */
  shiftStart: ShiftStartNotice | null;
}

/** UI state of who is using the phone; the navigation follows it (src/navigation). */
export const useSession = create<SessionState>(() => ({ mode: null, deviceId: null, activeUser: null, shiftStart: null }));

/** Reads the credentials and the database, cleans up leftovers, and sets the device mode. At start and after enrollment. */
export async function loadSession(db: Database): Promise<DeviceMode> {
  const [device, supervisorToken] = await Promise.all([getDeviceCredentials(), getSupervisorToken()]);
  const startup = resolveStartup({ hasDeviceCredentials: device !== null, deviceId: getKv(db, 'device.id'), hasSupervisorToken: supervisorToken !== null });
  if (startup.deleteDeviceCredentials) await deleteDeviceCredentials();
  if (startup.deleteSupervisorToken) await deleteSupervisorToken();
  useSession.setState({ mode: startup.mode, deviceId: startup.deviceId, activeUser: null, shiftStart: null });
  return startup.mode;
}
