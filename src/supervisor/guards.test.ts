import { eq } from 'drizzle-orm';

import { newPinVerifier, pinHash } from '@/auth/pin';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { setKv, type OutboxRejection } from '@/db/kv';
import { outbox, shifts, sites, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';

import {
  attachGuard,
  changePin,
  createGuard,
  createSupervisor,
  freshPin,
  guardName,
  loadSiteGuards,
  setGuardActive,
  supervisorEmail,
  validPassword,
} from './guards';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('expo-secure-store');
const { store: secureStore } = jest.requireMock<typeof import('../../__mocks__/expo-secure-store')>('expo-secure-store');

const AT = '2026-10-27T10:05:12.345Z';
const LATER = '2026-10-28T09:00:00.000Z';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const ME = { id: '019a2b3c-4d5e-7f00-8a00-000000000002', name: 'Kovács Anna' };
const PETER = '019a2b3c-4d5e-7f00-8a00-000000000011';
const GABOR = '019a2b3c-4d5e-7f00-8a00-000000000012';
const ESZTER = '019a2b3c-4d5e-7f00-8a00-000000000013';
const ZOLTAN = '019a2b3c-4d5e-7f00-8a00-000000000014';
const NEW_ID = '019a2b3c-4d5e-7f00-8a00-000000000019';
const DEVICE = '019a2b3c-4d5e-7f00-8a00-0000000000f1';

let db: Database;

beforeEach(async () => {
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  ({ db } = await createTestDatabase());
  for (const [id, name] of [
    [SITE, 'Raktár'],
    [OTHER_SITE, 'Iroda'],
  ] as const) {
    db.insert(sites)
      .values({ id, name, timezone: 'Europe/Budapest', no_data_alert_after_min: 120, created_by: ME.id, created_at: AT, updated_at: AT })
      .run();
  }
});

async function addUser(
  id: string,
  name: string,
  siteIds: string[],
  values: { role?: 'guard' | 'supervisor'; active?: boolean; pin?: string } = {},
) {
  const verifier = values.pin === undefined ? { pin_hash: null, pin_salt: null, pin_iterations: null } : await newPinVerifier(values.pin);
  db.insert(users)
    .values({ id, name, role: values.role ?? 'guard', ...verifier, active: values.active ?? true, created_at: AT, updated_at: AT })
    .run();
  for (const site_id of siteIds) db.insert(siteUser).values({ site_id, user_id: id }).run();
}

let shiftCount = 0;
function addShift(guardId: string, started_at: string, ended_at: string | null) {
  shiftCount += 1;
  const id = `019a2b3c-4d5e-7f00-8c00-${String(shiftCount).padStart(12, '0')}`;
  db.insert(shifts)
    .values({
      id,
      site_id: SITE,
      device_id: DEVICE,
      guard_id: guardId,
      started_at,
      ended_at,
      closed_by: ended_at === null ? null : 'guard',
      chain_entry_id: id,
    })
    .run();
}

const queued = () => db.select({ method: outbox.method, path: outbox.path, body: outbox.body }).from(outbox).all();

/** A random source giving these PINs, one per draw. */
const draws = (...pins: string[]) => {
  let i = 0;
  return (bytes: Uint8Array) => new DataView(bytes.buffer).setUint32(0, Number(pins[i++]));
};

const verifies = async (userId: string, pin: string) => {
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  return user.pin_hash === (await pinHash(pin, user.pin_salt!, user.pin_iterations!));
};

describe('loading', () => {
  test('the guards, active first by name, with their shifts on this phone; the supervisor; whom to assign', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
    await addUser(GABOR, 'Kiss Gábor', [SITE]);
    await addUser(ESZTER, 'Tóth Eszter', [SITE], { active: false });
    await addUser(ZOLTAN, 'Szabó Zoltán', [OTHER_SITE]);
    await addUser(ME.id, ME.name, [SITE, OTHER_SITE], { role: 'supervisor' });
    addShift(GABOR, '2026-10-26T19:00:00.000Z', '2026-10-27T07:00:00.000Z');
    addShift(GABOR, '2026-10-25T19:00:00.000Z', '2026-10-26T07:00:00.000Z');
    addShift(PETER, '2026-10-27T19:00:00.000Z', null);

    expect(loadSiteGuards(db, SITE, ME, [])).toEqual({
      site: { id: SITE, name: 'Raktár', timezone: 'Europe/Budapest' },
      guards: [
        { id: GABOR, name: 'Kiss Gábor', active: true, pin: 'unknown', on_shift: false, last_shift_at: '2026-10-26T19:00:00.000Z' },
        { id: PETER, name: 'Nagy Péter', active: true, pin: 'unknown', on_shift: true, last_shift_at: '2026-10-27T19:00:00.000Z' },
        { id: ESZTER, name: 'Tóth Eszter', active: false, pin: 'unknown', on_shift: false, last_shift_at: null },
      ],
      supervisors: [],
      me: { id: ME.id, name: ME.name, pin: 'unknown' },
      attachable: [{ id: ZOLTAN, name: 'Szabó Zoltán', role: 'guard' }],
      pinConflicts: [],
    });
  });

  test('the other supervisors of the site, and those of the other sites to assign, after the guards', async () => {
    const BELA = '019a2b3c-4d5e-7f00-8a00-000000000031';
    const CSILLA = '019a2b3c-4d5e-7f00-8a00-000000000032';
    const DORA = '019a2b3c-4d5e-7f00-8a00-000000000033';
    await addUser(ME.id, ME.name, [SITE, OTHER_SITE], { role: 'supervisor' });
    await addUser(CSILLA, 'Varga Csilla', [SITE], { role: 'supervisor', active: false });
    await addUser(BELA, 'Balogh Béla', [SITE], { role: 'supervisor' });
    await addUser(DORA, 'Fehér Dóra', [OTHER_SITE], { role: 'supervisor' });
    await addUser(ZOLTAN, 'Szabó Zoltán', [OTHER_SITE]);

    const loaded = loadSiteGuards(db, SITE, ME, [])!;
    expect(loaded.guards).toEqual([]);
    expect(loaded.supervisors).toEqual([
      { id: BELA, name: 'Balogh Béla', active: true, pin: 'unknown' },
      { id: CSILLA, name: 'Varga Csilla', active: false, pin: 'unknown' },
    ]);
    expect(loaded.attachable).toEqual([
      { id: ZOLTAN, name: 'Szabó Zoltán', role: 'guard' },
      { id: DORA, name: 'Fehér Dóra', role: 'supervisor' },
    ]);
    // The supervisor using the phone is not one of the others, not even on a site of theirs where they are not.
    expect(loadSiteGuards(db, OTHER_SITE, ME, [])!.attachable.map((person) => person.id)).toEqual([BELA]);
  });

  test('the site phone knows who has a PIN; a supervisor not on the site', async () => {
    setKv(db, 'device.id', DEVICE);
    await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
    await addUser(GABOR, 'Kiss Gábor', [SITE]);
    const loaded = loadSiteGuards(db, SITE, ME, [])!;
    expect(loaded.guards.map((guard) => [guard.name, guard.pin])).toEqual([
      ['Kiss Gábor', 'none'],
      ['Nagy Péter', 'set'],
    ]);
    expect(loaded.me).toEqual({ id: ME.id, name: ME.name, pin: 'unknown' });
    expect(loadSiteGuards(db, SITE, null, [])!.me).toBeNull();
    expect(loadSiteGuards(db, '019a2b3c-4d5e-7f00-8a00-0000000000a9', ME, [])).toBeNull();
  });

  test('the calls refused for a taken PIN: a new PIN, a guard assigned, a guard not created', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE]);
    const refusal = (call_id: string, method: string, path: string, extra: Partial<OutboxRejection> = {}): OutboxRejection => ({
      call_id,
      method,
      path,
      status: 409,
      code: 'conflict',
      message: 'Ez a PIN-kód már foglalt.',
      details: { pin: ['Egy telephelyen nem lehet két felhasználónak ugyanaz a PIN-kódja.'] },
      at: AT,
      ...extra,
    });
    const rejections = [
      refusal('c1', 'PUT', `/users/${PETER}/pin`),
      refusal('c2', 'POST', `/sites/${SITE}/users`, { record_ids: [PETER] }),
      refusal('c3', 'POST', '/users', { record_ids: [NEW_ID] }),
      refusal('c4', 'POST', `/sites/${OTHER_SITE}/users`, { record_ids: [PETER] }),
      refusal('c5', 'PUT', `/users/${ZOLTAN}/pin`),
      refusal('c6', 'POST', '/checkpoints', { details: { tag_uid: ['Foglalt.'] } }),
      refusal('c7', 'POST', '/users', { status: 422, code: 'validation_failed' }),
    ];
    expect(loadSiteGuards(db, SITE, ME, rejections)!.pinConflicts).toEqual([
      { call_id: 'c1', kind: 'pin', user: { id: PETER, name: 'Nagy Péter' } },
      { call_id: 'c2', kind: 'attach', user: { id: PETER, name: 'Nagy Péter' } },
      { call_id: 'c3', kind: 'create', user: null },
    ]);
  });
});

describe('a new PIN', () => {
  test('is not one another user of the sites has, on the site phone', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
    await addUser(ZOLTAN, 'Szabó Zoltán', [OTHER_SITE], { pin: '731905' });
    expect(await freshPin(db, { siteIds: [SITE], userId: null }, draws('482913', '731905'))).toBe('731905');
    // Zoltán's sites count too when he is assigned here.
    expect(await freshPin(db, { siteIds: [SITE], userId: ZOLTAN }, draws('482913', '731905', '264810'))).toBe('731905');
    expect(await freshPin(db, { siteIds: [OTHER_SITE], userId: PETER }, draws('482913', '731905', '264810'))).toBe('482913');
  });

  test('gives up after twenty taken draws', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
    await expect(freshPin(db, { siteIds: [SITE], userId: null }, draws(...Array<string>(20).fill('482913')))).rejects.toThrow(
      'No free PIN',
    );
  });
});

describe('the actions', () => {
  test('a new guard: the local user with a working PIN at once, the create with the PIN through the outbox', async () => {
    expect(await createGuard(db, { siteId: SITE, name: 'Kiss Péter', pin: '482913' }, LATER, () => NEW_ID)).toBe(NEW_ID);
    expect(db.select().from(users).get()).toEqual(
      expect.objectContaining({ id: NEW_ID, name: 'Kiss Péter', role: 'guard', active: true, pin_iterations: 100_000, created_at: LATER }),
    );
    expect(await verifies(NEW_ID, '482913')).toBe(true);
    expect(db.select().from(siteUser).all()).toEqual([{ site_id: SITE, user_id: NEW_ID }]);
    expect(queued()).toEqual([
      {
        method: 'POST',
        path: '/users',
        body: { id: NEW_ID, name: 'Kiss Péter', role: 'guard', pin: '482913', active: true, site_ids: [SITE] },
      },
    ]);
  });

  test('a new supervisor: the local user with a working PIN at once, the create with the login and the PIN', async () => {
    const login = { email: 'balogh.bela@example.com', password: 'jelszo-1234' };
    expect(await createSupervisor(db, { siteId: SITE, name: 'Balogh Béla', ...login, pin: '482913' }, LATER, () => NEW_ID)).toBe(NEW_ID);
    expect(db.select().from(users).get()).toEqual(
      expect.objectContaining({ id: NEW_ID, name: 'Balogh Béla', role: 'supervisor', active: true }),
    );
    expect(await verifies(NEW_ID, '482913')).toBe(true);
    expect(db.select().from(siteUser).all()).toEqual([{ site_id: SITE, user_id: NEW_ID }]);
    expect(queued()).toEqual([
      {
        method: 'POST',
        path: '/users',
        body: { id: NEW_ID, name: 'Balogh Béla', role: 'supervisor', email: login.email, pin: '482913', active: true, site_ids: [SITE] },
      },
    ]);
    // The password is not in the database: it waits in the secure store with the call (FR-012).
    const [call] = db.select({ id: outbox.id, secret: outbox.secret }).from(outbox).all();
    expect(call?.secret).toBe(true);
    expect(JSON.parse(secureStore.get(`waypost.outbox.${call!.id}`)!)).toEqual({ password: login.password });
  });

  test('the e-mail address and the password of a new supervisor, as the server takes them', () => {
    expect(supervisorEmail('  balogh.bela@example.com ')).toBe('balogh.bela@example.com');
    expect(supervisorEmail('bela@localhost')).toBeNull();
    expect(supervisorEmail('béla@example.com')).toBeNull();
    expect(supervisorEmail('bela@[127.0.0.1]')).toBeNull();
    expect(supervisorEmail('')).toBeNull();
    expect(supervisorEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
    expect(validPassword('1234567')).toBe(false);
    expect(validPassword('12345678')).toBe(true);
    expect(validPassword('x'.repeat(256))).toBe(false);
  });

  test('a new PIN: the old one stops working at once', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE], { pin: '482913' });
    await changePin(db, PETER, '731905', LATER);
    expect(await verifies(PETER, '731905')).toBe(true);
    expect(await verifies(PETER, '482913')).toBe(false);
    expect(queued()).toEqual([{ method: 'PUT', path: `/users/${PETER}/pin`, body: { pin: '731905' } }]);
  });

  test('a guard of another site assigned here, with a new PIN', async () => {
    await addUser(ZOLTAN, 'Szabó Zoltán', [OTHER_SITE], { pin: '482913' });
    await attachGuard(db, { siteId: SITE, userId: ZOLTAN, pin: '731905' }, LATER);
    expect(db.select().from(siteUser).all()).toEqual(
      expect.arrayContaining([
        { site_id: OTHER_SITE, user_id: ZOLTAN },
        { site_id: SITE, user_id: ZOLTAN },
      ]),
    );
    expect(await verifies(ZOLTAN, '731905')).toBe(true);
    expect(queued()).toEqual([{ method: 'POST', path: `/sites/${SITE}/users`, body: { user_id: ZOLTAN, pin: '731905' } }]);
  });

  test('a guard suspended and let in again', async () => {
    await addUser(PETER, 'Nagy Péter', [SITE]);
    setGuardActive(db, PETER, false, LATER);
    expect(db.select({ active: users.active, updated_at: users.updated_at }).from(users).get()).toEqual({
      active: false,
      updated_at: LATER,
    });
    setGuardActive(db, PETER, true, LATER);
    expect(queued()).toEqual([
      { method: 'PATCH', path: `/users/${PETER}`, body: { active: false } },
      { method: 'PATCH', path: `/users/${PETER}`, body: { active: true } },
    ]);
  });

  test('a name is trimmed; an empty one is none', () => {
    expect(guardName('  Kiss Péter ')).toBe('Kiss Péter');
    expect(guardName('   ')).toBeNull();
    expect(guardName('x'.repeat(300))).toHaveLength(255);
  });
});
