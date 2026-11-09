// A supervisor's own phone (specification, Azonosítás / Supervisor fiók): the supervisor logs in with their account,
// without enrolling the phone. There is no guard mode and no chain here; the pull brings the supervisor's sites, and the
// actions go through the outbox with their own token. Logging out deletes everything of the account from the phone, and
// so does enrolling it as a site phone (Telephelyi telefon hozzárendelése).
import type { DevicesEnrollResponse } from '@waypost/schema';
import { eq } from 'drizzle-orm';

import type { ApiClient } from '@/api/client';
import { enrollDevice, login, logout } from '@/api/endpoints';
import { loadSession, useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { deleteDeviceSyncState, deleteKv, getKv, setKv } from '@/db/kv';
import { devices, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { deleteSupervisorToken, getSupervisorToken, setSupervisorToken } from '@/device/credentials';
import { clearOutbox } from '@/sync/outbox';
import { countPending } from '@/sync/pending';
import { deleteConfiguration } from '@/sync/pull';
import { refreshPendingCount, whenSyncIdle } from '@/sync/runtime';
import { useSyncStatus } from '@/sync/status';

import { enrollmentRequest, phoneName, recordEnrollment, saveEnrollment } from './enrollment';

/** Deletes what the phone keeps of a supervisor account: the configuration, the pull cursor, the outbox, who it is. */
function clearAccountData(tx: Database): void {
  deleteConfiguration(tx);
  // No round uses them on a supervisor's phone.
  tx.delete(routeVersionCheckpoints).run();
  tx.delete(routeVersions).run();
  clearOutbox(tx);
  deleteDeviceSyncState(tx);
  deleteKv(tx, 'sync.last_success_at');
  deleteKv(tx, 'supervisor.account');
  deleteKv(tx, 'training.draft');
}

/** The sync status of the account deleted (clearAccountData). */
function resetAccountStatus(): void {
  useSyncStatus.setState({ rejectedCalls: [], lastSuccessAt: null, lastError: null });
  refreshPendingCount();
}

function deleteAccountData(db: Database): void {
  db.transaction(clearAccountData);
  resetAccountStatus();
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

/** A login with another account than the one whose data and unsent actions the phone keeps. */
export class OtherAccountError extends Error {
  override readonly name = 'OtherAccountError';

  /** accountName: the account the phone keeps. */
  constructor(readonly accountName: string) {
    super('The login is of another account than the one on the phone');
  }
}

/**
 * Logs the supervisor in again on their own phone after the server stopped taking its token (401, e.g. the token was
 * deleted on the server): POST /auth/login, and the new token replaces the old one. The account's data and the actions
 * waiting in the outbox stay, and a sync sends them at once (audit WP-APP-016). The login of another account is logged
 * out again and refused (OtherAccountError): the waiting actions are of the account on the phone, which has to log out
 * first to give the phone to someone else.
 */
export async function renewSupervisorLogin(db: Database, api: ApiClient, credentials: { email: string; password: string }): Promise<void> {
  if (useSession.getState().mode !== 'supervisor_phone') throw new Error("Not a supervisor's own phone");
  const account = getKv(db, 'supervisor.account');
  const { token, user } = await login(api, { email: credentials.email, password: credentials.password, device_name: phoneName() });
  if (account !== null && user.id !== account.id) {
    try {
      await logout(api, token);
    } catch {
      // The token is left among that account's tokens.
    }
    throw new OtherAccountError(account.name);
  }
  setKv(db, 'supervisor.account', { id: user.id, name: user.name, email: user.email });
  await setSupervisorToken(token);
  useSyncStatus.setState({ lastError: null });
  void useSyncStatus.getState().syncNow();
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

  // The server gives the secret only once, and has revoked the site's previous phone: the enrollment is stored before
  // anything else, so an interruption from here on leaves an enrolled phone (audit WP-APP-014). What is left of the
  // account then is deleted at the next start (finishInterruptedEnrollment).
  await saveEnrollment(db, response);
  // Without the token no new sync starts; a running one could still write the account's data.
  await deleteSupervisorToken();
  await whenSyncIdle();
  db.transaction((tx) => {
    clearAccountData(tx);
    // The device list is the account's too, and a sync of the account may have replaced it meanwhile.
    recordEnrollment(tx, response);
  });
  resetAccountStatus();
  try {
    await logout(api, token);
  } catch {
    // The phone is enrolled either way.
  }
  await loadSession(db);
  return response;
}

/**
 * At start: a site phone that still has a supervisor account's data was enrolled by enrollThisPhone, which stopped
 * after storing the enrollment (the app closed or crashed). The account's data is deleted as the enrollment would
 * have; the device and the pull's memory of it (sync.confirmed) stay. Returns whether there was anything to finish.
 */
export function finishInterruptedEnrollment(db: Database): boolean {
  const deviceId = getKv(db, 'device.id');
  if (useSession.getState().mode !== 'site_phone' || deviceId === null || getKv(db, 'supervisor.account') === null) return false;
  db.transaction((tx) => {
    const device = tx.select().from(devices).where(eq(devices.id, deviceId)).get();
    const confirmed = getKv(tx, 'sync.confirmed');
    clearAccountData(tx);
    if (device !== undefined) tx.insert(devices).values(device).run();
    if (confirmed !== null) setKv(tx, 'sync.confirmed', confirmed);
  });
  resetAccountStatus();
  return true;
}
