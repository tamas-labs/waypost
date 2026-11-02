// A revoked phone (specification, Azonosítás; M4-11): another phone took over the site. The server answers its requests
// with device_revoked, but takes its last upload. The flag is set first and stays over restarts: from then on no chain
// entry is written, so the last upload is complete, and every sync of the phone is this upload (runtime.ts): the
// batches, the photos, then done: true. After that the tokens and the secret go, and the phone is not enrolled.
import { pushFinal } from '@/api/endpoints';
import type { ApiClient } from '@/api/client';
import { loadSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { deleteDeviceSyncState, deleteKv, getKv, setKv } from '@/db/kv';
import { deleteDeviceCredentials } from '@/device/credentials';

import { deleteConfiguration } from './pull';
import { useSyncStatus } from './status';

export function isRevoked(db: Database): boolean {
  return getKv(db, 'device.revoked') !== null;
}

export function markRevoked(db: Database): void {
  setKv(db, 'device.revoked', true);
}

/** Closes the upload: done: true, whatever was rejected or is missing, as the phone cannot fix those any more. */
export async function closeUpload(api: ApiClient, token: string, deviceId: string): Promise<void> {
  await pushFinal(api, token, { device_id: deviceId, entries: [], done: true });
}

/**
 * The phone is not a site phone any more. The chain entries and the photos stay, what is not acknowledged forever; the
 * configuration with the PIN verifiers goes. A stop after the transaction is finished by the next start (auth/startup.ts).
 */
export async function forgetDevice(db: Database): Promise<void> {
  db.transaction((tx) => {
    deleteConfiguration(tx);
    deleteKv(tx, 'device.id');
    deleteDeviceSyncState(tx);
  });
  await deleteDeviceCredentials();
  useSyncStatus.setState({ replaced: true });
  await loadSession(db);
}
