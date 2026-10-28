/**
 * What the phone is (specification, Mobilapp): not enrolled (supervisor login only), the site phone (PIN login), or a
 * supervisor's own phone (site list).
 */
export type DeviceMode = 'unassigned' | 'site_phone' | 'supervisor_phone';

export interface StartupInput {
  hasDeviceCredentials: boolean;
  /** devices.id of this phone in the local database (kv device.id). */
  deviceId: string | null;
  hasSupervisorToken: boolean;
}

export interface Startup {
  mode: DeviceMode;
  deviceId: string | null;
  /**
   * Device token and secret without a database that knows the device: left in the iOS Keychain by an earlier
   * installation. The chain they belong to is gone with the old database, so they cannot be used and are deleted.
   */
  deleteDeviceCredentials: boolean;
  /** A supervisor token on the site phone (enrollment interrupted before deleting it); it must not stay there. */
  deleteSupervisorToken: boolean;
}

export function resolveStartup({ hasDeviceCredentials, deviceId, hasSupervisorToken }: StartupInput): Startup {
  if (hasDeviceCredentials && deviceId !== null) {
    return { mode: 'site_phone', deviceId, deleteDeviceCredentials: false, deleteSupervisorToken: hasSupervisorToken };
  }
  return {
    mode: hasSupervisorToken ? 'supervisor_phone' : 'unassigned',
    deviceId: null,
    deleteDeviceCredentials: hasDeviceCredentials,
    deleteSupervisorToken: false,
  };
}
