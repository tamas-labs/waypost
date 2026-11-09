import type { DevicesEnrollRequest, DevicesEnrollResponse } from '@waypost/schema';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { Database } from '@/db/database';
import { deleteDeviceSyncState, setKv } from '@/db/kv';
import { devices } from '@/db/schema';

import { setDeviceCredentials } from '@/device/credentials';
import { rememberConfirmed } from '@/sync/confirmed';

/** The phone's name, for its enrollment and for the supervisor's token (device_name of the login). */
export function phoneName(): string {
  return (Device.deviceName ?? Device.modelName ?? 'Waypost').slice(0, 255);
}

/** The enrollment request of this phone for a site. */
export function enrollmentRequest(siteId: string): DevicesEnrollRequest {
  return {
    site_id: siteId,
    name: phoneName(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  };
}

/** The device of POST /devices/enroll in the database: the only one kept, and the next pull a full one. */
export function recordEnrollment(tx: Database, { device, server_time }: Pick<DevicesEnrollResponse, 'device' | 'server_time'>): void {
  // Only this phone is kept (specification, Adatbázis).
  tx.delete(devices).run();
  tx.insert(devices).values(device).run();
  setKv(tx, 'device.id', device.id);
  deleteDeviceSyncState(tx);
  // The first pull, a full one, is too early to have the new device (sync/confirmed.ts).
  rememberConfirmed(tx, [device.id], server_time);
}

/**
 * Stores the result of POST /devices/enroll: the token and the secret in the secure store, the device in the database.
 * The next pull is a full one.
 */
export async function saveEnrollment(db: Database, response: DevicesEnrollResponse): Promise<void> {
  await setDeviceCredentials({ token: response.token, secret: response.secret });
  db.transaction((tx) => recordEnrollment(tx, response));
}
