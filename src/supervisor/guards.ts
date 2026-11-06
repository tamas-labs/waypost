// The guards and supervisors of a site and their PINs in supervisor mode (S9, S-Orok; specification (supervisor)/users):
// what the phone has of them, and the actions through the outbox – a new guard or supervisor, a new PIN, an existing
// guard or supervisor of another site assigned to this one, one suspended or let in again (audit WP-APP-007). The PIN is generated here and shown once (domain/pin-generate.ts); its verifier is stored locally
// at once, so on the site phone the guard can log in with it before the server has it. Only the site phone gets the
// PIN verifiers: there a PIN taken on the site is never offered; elsewhere the server's 409 tells (pinConflicts).
import type { Timestamp } from '@waypost/schema';
import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm';
import { getRandomValues } from 'expo-crypto';

import { configCalls } from '@/api/config-calls';
import { newPinVerifier, pinTaken } from '@/auth/pin';
import type { Database } from '@/db/database';
import { getKv, type OutboxRejection } from '@/db/kv';
import { shifts, sites, siteUser, users } from '@/db/schema';
import { generatePin, type RandomFill } from '@/domain/pin-generate';
import { schemaErrors } from '@/schema/validation';
import type { NewId } from '@/domain/state';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

/** The schema's limit of a name. */
export const GUARD_NAME_MAX = 255;
/** The schema's limits of a supervisor's e-mail address and password (api/user-create.request). */
export const EMAIL_MAX = 255;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 255;
/** Draws of a PIN not taken on the site before giving up (with ten users, one in a hundred thousand is taken). */
const PIN_DRAWS = 20;

/** set / none: the site phone knows; unknown: elsewhere the pull does not bring the PIN fields. */
export type PinState = 'set' | 'none' | 'unknown';

export interface SiteGuard {
  id: string;
  name: string;
  active: boolean;
  pin: PinState;
  /** On a shift on this phone now (the shifts are the site phone's). */
  on_shift: boolean;
  /** The start of their last shift on this phone; null: none. */
  last_shift_at: Timestamp | null;
}

/** Another supervisor of the site (the one using the phone is `me`). */
export interface SiteSupervisor {
  id: string;
  name: string;
  active: boolean;
  pin: PinState;
}

export type UserRole = 'guard' | 'supervisor';

/** A call about a PIN the server refused because another user of the site has that PIN (409, details.pin). */
export interface PinConflict {
  call_id: string;
  kind: 'create' | 'pin' | 'attach';
  /** The user whose PIN was refused; null for a guard not created (the pull has removed them). */
  user: { id: string; name: string } | null;
}

export interface SiteGuards {
  site: { id: string; name: string; timezone: string };
  /** Active ones first, by name. */
  guards: SiteGuard[];
  /** The other supervisors of the site, active ones first, by name. */
  supervisors: SiteSupervisor[];
  /** The supervisor using the phone, for their own PIN. */
  me: { id: string; name: string; pin: PinState } | null;
  /**
   * Active guards and supervisors of the supervisor's other sites, to assign to this one (only a supervisor's own phone
   * sees them), guards first, by name.
   */
  attachable: { id: string; name: string; role: UserRole }[];
  pinConflicts: PinConflict[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'hu');

/** The site phone gets the PIN verifiers of its site's users; a supervisor's own phone none. */
const pinsKnown = (db: Database) => getKv(db, 'device.id') !== null;

function pinState(db: Database, hash: string | null): PinState {
  if (!pinsKnown(db)) return 'unknown';
  return hash === null ? 'none' : 'set';
}

/**
 * The site's guards, the supervisor's own PIN, the guards to assign and the PIN conflicts among the refused calls (the
 * sync status's, which follow the stored ones); null without the site.
 */
export function loadSiteGuards(
  db: Database,
  siteId: string,
  account: { id: string; name: string } | null,
  rejections: readonly OutboxRejection[],
): SiteGuards | null {
  const site = db.select({ id: sites.id, name: sites.name, timezone: sites.timezone }).from(sites).where(eq(sites.id, siteId)).get();
  if (site === undefined) return null;
  const onSite = db
    .select({ id: users.id, name: users.name, role: users.role, active: users.active, pin_hash: users.pin_hash })
    .from(users)
    .innerJoin(siteUser, eq(siteUser.user_id, users.id))
    .where(eq(siteUser.site_id, siteId))
    .all();
  const guardRows = onSite.filter((user) => user.role === 'guard');
  const guardIds = guardRows.map((guard) => guard.id);

  const open = new Set(
    guardIds.length === 0
      ? []
      : db
          .select({ guard_id: shifts.guard_id })
          .from(shifts)
          .where(and(eq(shifts.site_id, siteId), isNull(shifts.ended_at), inArray(shifts.guard_id, guardIds)))
          .all()
          .map((shift) => shift.guard_id),
  );
  const lastShift = new Map(
    guardIds.length === 0
      ? []
      : db
          .select({ guard_id: shifts.guard_id, at: max(shifts.started_at) })
          .from(shifts)
          .where(and(eq(shifts.site_id, siteId), inArray(shifts.guard_id, guardIds)))
          .groupBy(shifts.guard_id)
          .all()
          .map((row) => [row.guard_id, row.at]),
  );

  const guards = guardRows
    .map((guard) => ({
      id: guard.id,
      name: guard.name,
      active: guard.active,
      pin: pinState(db, guard.pin_hash),
      on_shift: open.has(guard.id),
      last_shift_at: lastShift.get(guard.id) ?? null,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));

  const supervisors = onSite
    .filter((user) => user.role === 'supervisor' && user.id !== account?.id)
    .map((user) => ({ id: user.id, name: user.name, active: user.active, pin: pinState(db, user.pin_hash) }))
    .sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b));

  const meRow = account === null ? undefined : onSite.find((user) => user.id === account.id);
  const me =
    account === null
      ? null
      : {
          id: account.id,
          name: meRow?.name ?? account.name,
          pin: meRow === undefined ? ('unknown' as const) : pinState(db, meRow.pin_hash),
        };

  const onSiteIds = new Set(onSite.map((user) => user.id));
  const attachable = db
    .selectDistinct({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .innerJoin(siteUser, eq(siteUser.user_id, users.id))
    .where(eq(users.active, true))
    .orderBy(asc(users.name))
    .all()
    .filter((user) => !onSiteIds.has(user.id) && user.id !== account?.id)
    .sort((a, b) => Number(a.role === 'supervisor') - Number(b.role === 'supervisor') || byName(a, b));

  // A guard whose assignment was refused is no longer on the site after the full pull, but still on the phone.
  const names = new Map(
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .all()
      .map((user) => [user.id, user.name]),
  );
  const pinConflicts = rejections.flatMap((rejection): PinConflict[] => {
    if (rejection.code !== 'conflict' || rejection.details?.pin === undefined) return [];
    const userOf = (id: string | undefined) => (id === undefined || !names.has(id) ? null : { id, name: names.get(id)! });
    if (rejection.method === 'POST' && rejection.path === '/users') return [{ call_id: rejection.call_id, kind: 'create', user: null }];
    const pin = /^\/users\/([^/]+)\/pin$/.exec(rejection.path);
    if (rejection.method === 'PUT' && pin !== null) {
      const user = userOf(pin[1]);
      return user === null ? [] : [{ call_id: rejection.call_id, kind: 'pin', user }];
    }
    if (rejection.method === 'POST' && rejection.path === `/sites/${siteId}/users`) {
      return [{ call_id: rejection.call_id, kind: 'attach', user: userOf(rejection.record_ids?.[0]) }];
    }
    return [];
  });

  return { site, guards, supervisors, me, attachable, pinConflicts };
}

/** The sites of a user on the phone. */
const sitesOf = (db: Database, userId: string) =>
  db
    .select({ site_id: siteUser.site_id })
    .from(siteUser)
    .where(eq(siteUser.user_id, userId))
    .all()
    .map((row) => row.site_id);

/**
 * A new PIN for a user of these sites (the user's own, and the site they are being assigned to), not taken by another
 * user of them as far as the phone knows. Throws if every draw is taken (it does not happen with a few dozen users).
 */
export async function freshPin(
  db: Database,
  { siteIds, userId }: { siteIds: readonly string[]; userId: string | null },
  random: RandomFill = (bytes) => void getRandomValues(bytes),
): Promise<string> {
  const all = [...new Set([...siteIds, ...(userId === null ? [] : sitesOf(db, userId))])];
  for (let draw = 0; draw < PIN_DRAWS; draw += 1) {
    const pin = generatePin(random);
    if (!(await pinTaken(db, all, pin, userId))) return pin;
  }
  throw new Error('No free PIN found');
}

/** The trimmed name of a new guard, or null if it is empty. */
export function guardName(text: string): string | null {
  const name = text.trim();
  return name.length === 0 ? null : name.slice(0, GUARD_NAME_MAX);
}

/** The trimmed e-mail address of a new supervisor, or null if it is not one the server takes (common/email.json). */
export function supervisorEmail(text: string): string | null {
  const email = text.trim();
  return email.length <= EMAIL_MAX && schemaErrors('common/email', email).length === 0 ? email : null;
}

/** Whether a password is one the server takes for a supervisor. */
export const validPassword = (password: string) => password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

/**
 * A new supervisor of the site, with their login (e-mail address and password, for their own phone) and the PIN shown
 * (for the site phone); returns their ID. The password goes in the outbox call and nowhere else on the phone; the call
 * is deleted once the server has it. A taken e-mail address is the server's 409, told among the refused calls.
 */
export async function createSupervisor(
  db: Database,
  { siteId, name, email, password, pin }: { siteId: string; name: string; email: string; password: string; pin: string },
  now: Timestamp = nowTimestamp(),
  newId: NewId = uuidv7,
): Promise<string> {
  const verifier = await newPinVerifier(pin);
  const id = newId();
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.insert(users)
        .values({ id, name, role: 'supervisor', ...verifier, active: true, created_at: now, updated_at: now })
        .run();
      tx.insert(siteUser).values({ site_id: siteId, user_id: id }).run();
    },
    calls: [configCalls.createUser({ id, name, role: 'supervisor', email, password, pin, active: true, site_ids: [siteId] })],
  });
  return id;
}

/** A new guard of the site with the PIN shown; returns their ID. */
export async function createGuard(
  db: Database,
  { siteId, name, pin }: { siteId: string; name: string; pin: string },
  now: Timestamp = nowTimestamp(),
  newId: NewId = uuidv7,
): Promise<string> {
  const verifier = await newPinVerifier(pin);
  const id = newId();
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.insert(users)
        .values({ id, name, role: 'guard', ...verifier, active: true, created_at: now, updated_at: now })
        .run();
      tx.insert(siteUser).values({ site_id: siteId, user_id: id }).run();
    },
    calls: [configCalls.createUser({ id, name, role: 'guard', pin, active: true, site_ids: [siteId] })],
  });
  return id;
}

/** A new PIN for a user (a guard of the site, or the supervisor's own): the old one stops working at once. */
export async function changePin(db: Database, userId: string, pin: string, now: Timestamp = nowTimestamp()): Promise<void> {
  const verifier = await newPinVerifier(pin);
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.update(users)
        .set({ ...verifier, updated_at: now })
        .where(eq(users.id, userId))
        .run();
    },
    calls: [configCalls.setUserPin(userId, { pin })],
  });
}

/** A guard or supervisor of another site assigned to this one: they get the PIN shown, on all their sites (the server's rule). */
export async function attachGuard(
  db: Database,
  { siteId, userId, pin }: { siteId: string; userId: string; pin: string },
  now: Timestamp = nowTimestamp(),
): Promise<void> {
  const verifier = await newPinVerifier(pin);
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.insert(siteUser).values({ site_id: siteId, user_id: userId }).onConflictDoNothing().run();
      tx.update(users)
        .set({ ...verifier, updated_at: now })
        .where(eq(users.id, userId))
        .run();
    },
    calls: [configCalls.attachSiteUser(siteId, { user_id: userId, pin })],
  });
}

/** A guard or another supervisor suspended (cannot log in) or let in again. */
export function setGuardActive(db: Database, userId: string, active: boolean, now: Timestamp = nowTimestamp()): void {
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.update(users).set({ active, updated_at: now }).where(eq(users.id, userId)).run();
    },
    calls: [configCalls.updateUser(userId, { active })],
  });
}
