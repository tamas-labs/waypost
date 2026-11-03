// PIN login on the site phone, offline: the PIN is checked against the verifiers of the site's users that pull
// delivered (PBKDF2-HMAC-SHA256, waypost-schema pin/test-vectors.json), with the lockout of src/domain/pin-lockout.ts
// kept in the kv table. The PIN identifies the user, so every user of the site with a PIN is a candidate.
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { getRandomValues } from 'expo-crypto';
import { Buffer, pbkdf2 } from 'react-native-quick-crypto';

import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { devices, siteUser, users } from '@/db/schema';
import { lockStatus, NO_LOCKOUT, registerFailure } from '@/domain/pin-lockout';
import { readClock as readDeviceClock, type ReadClock } from '@/time/clock';

const PIN = /^[0-9]{6}$/;
const HASH_BYTES = 32;
/** The server's parameters (specification: PIN-kód): a 16-byte random salt, 100 000 iterations. */
export const PIN_ITERATIONS = 100_000;
const SALT_BYTES = 16;

/** pin_hash (base64) of a PIN: PBKDF2-HMAC-SHA256 over its ASCII digits with the raw salt; natively, off the JS thread. */
export function pinHash(pin: string, saltBase64: string, iterations: number): Promise<string> {
  if (!PIN.test(pin)) return Promise.reject(new Error('A PIN is 6 digits'));
  return new Promise((resolve, reject) => {
    pbkdf2(Buffer.from(pin, 'ascii'), Buffer.from(saltBase64, 'base64'), iterations, HASH_BYTES, 'sha256', (error, key) => {
      if (error !== null && error !== undefined) reject(error);
      else if (key === undefined) reject(new Error('PBKDF2 returned no key'));
      else resolve(Buffer.from(key).toString('base64'));
    });
  });
}

export interface PinVerifier {
  pin_hash: string;
  pin_salt: string;
  pin_iterations: number;
}

/**
 * The verifier of a PIN the supervisor has just set, as the server makes it: stored locally at once, so the user can
 * log in with it on the site phone before the server's response (which brings the server's own salt and hash).
 */
export async function newPinVerifier(
  pin: string,
  random: (bytes: Uint8Array) => void = (b) => void getRandomValues(b),
): Promise<PinVerifier> {
  const salt = new Uint8Array(SALT_BYTES);
  random(salt);
  const pin_salt = Buffer.from(salt).toString('base64');
  return { pin_hash: await pinHash(pin, pin_salt, PIN_ITERATIONS), pin_salt, pin_iterations: PIN_ITERATIONS };
}

/**
 * Whether another user of these sites has this PIN, as far as the phone can tell: only the site phone gets the PIN
 * verifiers, so elsewhere the server's 409 is the check. Inactive users count too (the server's uniqueness does).
 */
export async function pinTaken(db: Database, siteIds: readonly string[], pin: string, exceptUserId: string | null): Promise<boolean> {
  if (siteIds.length === 0) return false;
  const others = db
    .selectDistinct({ id: users.id, pin_hash: users.pin_hash, pin_salt: users.pin_salt, pin_iterations: users.pin_iterations })
    .from(users)
    .innerJoin(siteUser, eq(siteUser.user_id, users.id))
    .where(
      and(
        inArray(siteUser.site_id, [...siteIds]),
        isNotNull(users.pin_hash),
        isNotNull(users.pin_salt),
        isNotNull(users.pin_iterations),
        ...(exceptUserId === null ? [] : [ne(users.id, exceptUserId)]),
      ),
    )
    .all();
  const hashes = await Promise.all(others.map((user) => pinHash(pin, user.pin_salt!, user.pin_iterations!)));
  return others.some((user, i) => user.pin_hash === hashes[i]);
}

export type PinLoginResult =
  | { status: 'ok'; user: { id: string; name: string; role: 'guard' | 'supervisor' } }
  /** A wrong PIN; remaining_ms > 0 if it started a lock. */
  | { status: 'wrong'; failures: number; remaining_ms: number }
  /** Locked: the PIN was not checked. */
  | { status: 'locked'; remaining_ms: number };

/** How long PINs cannot be entered now (for the countdown of the PIN screen); 0 if they can. */
export function pinLockRemaining(db: Database, readClock: ReadClock = readDeviceClock): number {
  const lockout = getKv(db, 'pin.lockout') ?? NO_LOCKOUT;
  const status = lockStatus(lockout, readClock());
  if (status.lockout !== lockout) setKv(db, 'pin.lockout', status.lockout);
  return status.remaining_ms;
}

/** The active users of this phone's site who have a PIN. */
function candidates(db: Database) {
  const deviceId = getKv(db, 'device.id');
  const siteId =
    deviceId === null ? undefined : db.select({ site_id: devices.site_id }).from(devices).where(eq(devices.id, deviceId)).get()?.site_id;
  if (siteId === undefined || siteId === null) throw new Error('The phone is not assigned to a site');
  return db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      pin_hash: users.pin_hash,
      pin_salt: users.pin_salt,
      pin_iterations: users.pin_iterations,
    })
    .from(users)
    .innerJoin(siteUser, eq(siteUser.user_id, users.id))
    .where(
      and(
        eq(siteUser.site_id, siteId),
        eq(users.active, true),
        isNotNull(users.pin_hash),
        isNotNull(users.pin_salt),
        isNotNull(users.pin_iterations),
      ),
    )
    .all();
}

async function checkPin(
  db: Database,
  pin: string,
  readClock: ReadClock,
  usersToCheck: () => ReturnType<typeof candidates>,
): Promise<PinLoginResult> {
  if (!PIN.test(pin)) throw new Error('A PIN is 6 digits');
  const remaining = pinLockRemaining(db, readClock);
  if (remaining > 0) return { status: 'locked', remaining_ms: remaining };

  const siteUsers = usersToCheck();
  const hashes = await Promise.all(siteUsers.map((candidate) => pinHash(pin, candidate.pin_salt!, candidate.pin_iterations!)));
  const user = siteUsers.find((candidate, i) => candidate.pin_hash === hashes[i]);
  const clock = readClock();
  if (user !== undefined) {
    setKv(db, 'pin.lockout', NO_LOCKOUT);
    return { status: 'ok', user: { id: user.id, name: user.name, role: user.role } };
  }
  const lockout = registerFailure(getKv(db, 'pin.lockout') ?? NO_LOCKOUT, clock);
  setKv(db, 'pin.lockout', lockout);
  return { status: 'wrong', failures: lockout.failures, remaining_ms: lockout.lock?.duration_ms ?? 0 };
}

/** Checks a PIN entered on the PIN pad (6 digits) and updates the lockout. */
export function pinLogin(db: Database, pin: string, readClock: ReadClock = readDeviceClock): Promise<PinLoginResult> {
  return checkPin(db, pin, readClock, () => candidates(db));
}

/** Checks that the PIN is this user's, for a step the user confirms; anyone else's PIN is a wrong one, under the same lockout. */
export function pinConfirm(db: Database, userId: string, pin: string, readClock: ReadClock = readDeviceClock): Promise<PinLoginResult> {
  return checkPin(db, pin, readClock, () => candidates(db).filter((candidate) => candidate.id === userId));
}
