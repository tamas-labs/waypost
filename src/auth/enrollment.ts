import type { DevicesEnrollRequest, DevicesEnrollResponse } from '@waypost/schema';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { ApiClient } from '@/api/client';
import { enrollDevice, logout } from '@/api/endpoints';
import type { Database } from '@/db/database';
import { deleteKv, setKv } from '@/db/kv';
import { devices } from '@/db/schema';

import { deleteSupervisorToken, setDeviceCredentials } from './credentials';
import { loadSession } from './session';

/** The enrollment request of this phone for a site. */
export function enrollmentRequest(siteId: string): DevicesEnrollRequest {
  return {
    site_id: siteId,
    name: (Device.deviceName ?? Device.modelName ?? 'Waypost').slice(0, 255),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  };
}

/**
 * Stores the result of POST /devices/enroll: the token and the secret in the secure store, the device in the database.
 * The next pull is a full one.
 */
export async function saveEnrollment(db: Database, { device, token, secret }: DevicesEnrollResponse): Promise<void> {
  await setDeviceCredentials({ token, secret });
  db.transaction((tx) => {
    // Only this phone is kept (specification, Adatbázis).
    tx.delete(devices).run();
    tx.insert(devices).values(device).run();
    setKv(tx, 'device.id', device.id);
    deleteKv(tx, 'sync.cursor');
  });
}

/**
 * Makes this phone the site phone of a site (specification, Telephelyi telefon hozzárendelése): enrolls it, stores the
 * device token and secret, then logs the supervisor out on the server and deletes their token from this phone, and
 * switches the session to the site phone. The full pull follows from the sync (M3-07).
 */
export async function enrollThisPhone(db: Database, api: ApiClient, supervisorToken: string, siteId: string): Promise<DevicesEnrollResponse> {
  const response = await enrollDevice(api, supervisorToken, enrollmentRequest(siteId));
  await saveEnrollment(db, response);
  try {
    await logout(api, supervisorToken);
  } catch {
    // The phone is enrolled either way; a token left on the server is only listed among the supervisor's tokens.
  }
  await deleteSupervisorToken();
  await loadSession(db);
  return response;
}
