// A supervisor's own phone (specification, Azonosítás / Supervisor fiók): the supervisor logs in with their account,
// without enrolling the phone. There is no guard mode and no chain here; the pull brings the supervisor's sites, and the
// actions go through the outbox with their own token. Logging out deletes everything of the account from the phone.
import type { ApiClient } from '@/api/client';
import { login, logout } from '@/api/endpoints';
import type { Database } from '@/db/database';
import { deleteDeviceSyncState, deleteKv } from '@/db/kv';
import { routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { deleteSupervisorToken, getSupervisorToken, setSupervisorToken } from '@/device/credentials';
import { clearOutbox } from '@/sync/outbox';
import { countPending } from '@/sync/pending';
import { deleteConfiguration } from '@/sync/pull';
import { refreshPendingCount, whenSyncIdle } from '@/sync/runtime';
import { useSyncStatus } from '@/sync/status';

import { phoneName } from './enrollment';
import { loadSession, useSession } from './session';

/** Deletes what the phone keeps of a supervisor account: the configuration, the pull cursor, the outbox. */
function deleteAccountData(db: Database): void {
  db.transaction((tx) => {
    deleteConfiguration(tx);
    // No round uses them on a supervisor's phone.
    tx.delete(routeVersionCheckpoints).run();
    tx.delete(routeVersions).run();
    clearOutbox(tx);
    deleteDeviceSyncState(tx);
    deleteKv(tx, 'sync.last_success_at');
  });
  useSyncStatus.setState({ rejectedCalls: [], lastSuccessAt: null, lastError: null });
  refreshPendingCount();
}

/**
 * Logs a supervisor in on a phone that is not enrolled (POST /auth/login), stores the token, and makes the phone the
 * supervisor's own: the session's change starts a sync, whose first pull is a full one. Throws the API's error (401
 * unauthenticated for a wrong e-mail address or password); nothing is stored then.
 */
export async function signInSupervisor(db: Database, api: ApiClient, credentials: { email: string; password: string }): Promise<void> {
  if (useSession.getState().mode !== 'unassigned') throw new Error('Only a phone that is not enrolled has a supervisor login');
  const { token } = await login(api, { email: credentials.email, password: credentials.password, device_name: phoneName() });
  // Left over by an interrupted logout, if anything.
  deleteAccountData(db);
  await setSupervisorToken(token);
  // The phone is the supervisor's now: what the login screen told about a replaced site phone is over.
  useSyncStatus.setState({ replaced: false });
  await loadSession(db);
}

/** The supervisor actions not sent yet: they are lost at logout, so the screen asks first. */
export function unsentSupervisorActions(db: Database): number {
  return countPending(db).outbox;
}

/**
 * Logs the supervisor out of their own phone: deletes the token on the server (if the phone is online and it answers;
 * otherwise the token is only left among the supervisor's tokens) and on the phone, waits for a running sync, which
 * could still write the account's data, then deletes that data, and the phone is not enrolled again.
 */
export async function signOutSupervisor(db: Database, api: ApiClient | null): Promise<void> {
  if (useSession.getState().mode !== 'supervisor_phone') throw new Error("Not a supervisor's own phone");
  const token = await getSupervisorToken();
  // Offline the request would only make the supervisor wait for its timeout.
  if (token !== null && api !== null && useSyncStatus.getState().online !== false) {
    try {
      await logout(api, token);
    } catch {
      // Offline, or the token is gone already: the phone forgets it either way.
    }
  }
  // Without the token no new sync starts (its context is null).
  await deleteSupervisorToken();
  await whenSyncIdle();
  deleteAccountData(db);
  await loadSession(db);
}
