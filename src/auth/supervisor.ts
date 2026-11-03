// A supervisor's own phone (specification, Azonosítás / Supervisor fiók): the supervisor logs in with their account,
// without enrolling the phone. There is no guard mode and no chain here; the pull brings the supervisor's sites, and the
// actions go through the outbox with their own token. Logging out deletes everything of the account from the phone, and
// so does enrolling it as a site phone (Telephelyi telefon hozzárendelése).
import type { DevicesEnrollResponse } from '@waypost/schema';

import type { ApiClient } from '@/api/client';
import { enrollDevice, login, logout } from '@/api/endpoints';
import type { Database } from '@/db/database';
import { deleteDeviceSyncState, deleteKv, setKv } from '@/db/kv';
import { routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { deleteSupervisorToken, getSupervisorToken, setSupervisorToken } from '@/device/credentials';
import { clearOutbox } from '@/sync/outbox';
import { countPending } from '@/sync/pending';
import { deleteConfiguration } from '@/sync/pull';
import { refreshPendingCount, whenSyncIdle } from '@/sync/runtime';
import { useSyncStatus } from '@/sync/status';

import { enrollmentRequest, phoneName, saveEnrollment } from './enrollment';
import { loadSession, useSession } from './session';

/** Deletes what the phone keeps of a supervisor account: the configuration, the pull cursor, the outbox, who it is. */
function deleteAccountData(db: Database): void {
  db.transaction((tx) => {
    deleteConfiguration(tx);
    // No round uses them on a supervisor's phone.
    tx.delete(routeVersionCheckpoints).run();
    tx.delete(routeVersions).run();
    clearOutbox(tx);
    deleteDeviceSyncState(tx);
    deleteKv(tx, 'sync.last_success_at');
    deleteKv(tx, 'supervisor.account');
    deleteKv(tx, 'training.draft');
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
  const { token, user } = await login(api, { email: credentials.email, password: credentials.password, device_name: phoneName() });
  // Left over by an interrupted logout, if anything.
  deleteAccountData(db);
  setKv(db, 'supervisor.account', { id: user.id, name: user.name, email: user.email });
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

/** Supervisor actions are still waiting in the outbox: with the supervisor's token gone they could not be sent. */
export class UnsentActionsError extends Error {
  override readonly name = 'UnsentActionsError';

  constructor(readonly count: number) {
    super(`${count} supervisor action(s) not sent yet`);
  }
}

/**
 * Makes the supervisor's own phone the site phone of one of their sites (specification, Telephelyi telefon
 * hozzárendelése). First the actions waiting in the outbox go out with a sync (the site itself may be one of them, and
 * after the enrollment the supervisor's token is gone); if any is left, UnsentActionsError and nothing changes. Then
 * POST /devices/enroll with the supervisor's token (a site with a phone gets the new one, the old one is revoked by the
 * server). The token leaves the phone, a running sync is waited for, the account's data is deleted, the device token and
 * secret are stored, the supervisor is logged out on the server (a failure only leaves the token among theirs), and the
 * session becomes the site phone: its sync starts with the full pull, the navigation goes to the PIN login.
 * An error of the enrollment (network, 401, 403 …) is thrown before anything changed.
 */
export async function enrollThisPhone(db: Database, api: ApiClient, siteId: string): Promise<DevicesEnrollResponse> {
  if (useSession.getState().mode !== 'supervisor_phone') throw new Error("Only a supervisor's own phone is enrolled here");
  const token = await getSupervisorToken();
  if (token === null) throw new Error('No supervisor token on this phone');
  if (countPending(db).outbox > 0) {
    await useSyncStatus.getState().syncNow();
    const unsent = countPending(db).outbox;
    if (unsent > 0) throw new UnsentActionsError(unsent);
  }

  const response = await enrollDevice(api, token, enrollmentRequest(siteId));

  // Without the token no new sync starts; a running one could still write the account's data.
  await deleteSupervisorToken();
  await whenSyncIdle();
  deleteAccountData(db);
  await saveEnrollment(db, response);
  try {
    await logout(api, token);
  } catch {
    // The phone is enrolled either way.
  }
  await loadSession(db);
  return response;
}
