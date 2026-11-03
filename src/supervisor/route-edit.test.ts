import type { SchemaPath } from '@waypost/schema';
import { asc, eq, sql } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { PhotoFile } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { checkpoints, media, outbox, routes, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { beginRouteEdit, removeEditPoint, reorderEditPoints, RouteEditError, setEditOrderMode, updateEditPoint } from '@/domain/route-edit';
import { photoFile } from '@/photo/files';
import { schemaErrors } from '@/schema/validation';
import { storeServerRecords } from '@/sync/pull';

import { loadRouteEditBase, saveRouteEdit } from './route-edit';
import { nextVersionNumber } from './route-version';

jest.mock('expo-file-system');
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const AT = '2026-10-27T10:05:12.345Z';
const SAVED_AT = '2026-11-03T09:00:00.000Z';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';
const OTHER = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const OLD_VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const STORE = '019a2b3c-4d5e-7f00-8a00-0000000000c2';
const BACK = '019a2b3c-4d5e-7f00-8a00-0000000000c3';
const OLD_PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e1';
const PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e2';
const NEW_VERSION = '019a2b3c-4d5e-7f00-8b00-000000000001';

let db: Database;
const newId = () => NEW_VERSION;

function checkpoint(id: string, name: string, extra: { instruction?: string; photo_media_id?: string } = {}) {
  db.insert(checkpoints)
    .values({
      id,
      site_id: SITE,
      name,
      instruction: extra.instruction ?? null,
      tag_type: 'nfc',
      tag_uid: `04A1B2C3D4E5${id.slice(-2)}`,
      qr_payload: null,
      lat_e7: null,
      lng_e7: null,
      accuracy_dm: null,
      photo_media_id: extra.photo_media_id ?? null,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

function version(id: string, n: number, points: [string, number | null][]) {
  db.insert(routeVersions).values({ id, route_id: ROUTE, version: n, walk_duration_s: 215, created_by: OTHER, created_at: AT }).run();
  db.insert(routeVersionCheckpoints)
    .values(
      points.map(([checkpoint_id, walk_time_from_prev_s], index) => ({
        route_version_id: id,
        checkpoint_id,
        position: index + 1,
        walk_time_from_prev_s,
      })),
    )
    .run();
}

/** Éjszakai kör, version 4: Kapu → Raktár 95 s → Hátsó kapu 120 s. */
beforeEach(async () => {
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'supervisor_phone', deviceId: null, activeUser: null, shiftStart: null });
  checkpoint(GATE, 'Kapu', { photo_media_id: OLD_PHOTO });
  checkpoint(STORE, 'Raktár', { instruction: 'Zárva van?' });
  checkpoint(BACK, 'Hátsó kapu');
  db.insert(routes)
    .values({
      id: ROUTE,
      site_id: SITE,
      name: 'Éjszakai kör',
      order_mode: 'free',
      current_version_id: OLD_VERSION,
      active: true,
      created_at: AT,
      updated_at: AT,
    })
    .run();
  version('019a2b3c-4d5e-7f00-8a00-0000000000d0', 3, [[GATE, null]]);
  version(OLD_VERSION, 4, [
    [GATE, null],
    [STORE, 95],
    [BACK, 120],
  ]);
});

const base = () => {
  const loaded = loadRouteEditBase(db, ROUTE);
  if (loaded === null) throw new Error('No route to edit');
  return loaded;
};

function queued() {
  return db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body, body_schema: outbox.body_schema, media_id: outbox.media_id })
    .from(outbox)
    .orderBy(sql`rowid`)
    .all();
}

const versionPoints = (id: string) =>
  db
    .select({ checkpoint_id: routeVersionCheckpoints.checkpoint_id, walk: routeVersionCheckpoints.walk_time_from_prev_s })
    .from(routeVersionCheckpoints)
    .where(eq(routeVersionCheckpoints.route_version_id, id))
    .orderBy(asc(routeVersionCheckpoints.position))
    .all();

describe('the route to edit', () => {
  it('is its current version with the checkpoints by position', () => {
    expect(base()).toEqual({
      route: { id: ROUTE, site_id: SITE, name: 'Éjszakai kör', order_mode: 'free' },
      version_id: OLD_VERSION,
      version: 4,
      walk_duration_s: 215,
      points: [
        { checkpoint_id: GATE, name: 'Kapu', tag_type: 'nfc', instruction: null, photo_media_id: OLD_PHOTO, walk_time_from_prev_s: null },
        {
          checkpoint_id: STORE,
          name: 'Raktár',
          tag_type: 'nfc',
          instruction: 'Zárva van?',
          photo_media_id: null,
          walk_time_from_prev_s: 95,
        },
        { checkpoint_id: BACK, name: 'Hátsó kapu', tag_type: 'nfc', instruction: null, photo_media_id: null, walk_time_from_prev_s: 120 },
      ],
    });
  });

  it('leaves out a checkpoint that is gone from the phone', () => {
    db.delete(checkpoints).where(eq(checkpoints.id, STORE)).run();
    expect(base().points.map((point) => point.checkpoint_id)).toEqual([GATE, BACK]);
  });

  it('is none for a route that is not on the phone, or has no version', () => {
    expect(loadRouteEditBase(db, '019a2b3c-4d5e-7f00-8a00-0000000000b9')).toBeNull();
    db.update(routes).set({ current_version_id: null }).run();
    expect(loadRouteEditBase(db, ROUTE)).toBeNull();
  });
});

describe('saving the edited route', () => {
  it('stores the new version locally with the walk inherited, and queues its calls in order', () => {
    let edit = beginRouteEdit(base());
    edit = updateEditPoint(edit, BACK, { name: 'Hátsó kapu – sorompó', instruction: 'Lent van?', photo: null });
    edit = setEditOrderMode(removeEditPoint(edit, STORE), 'fixed');

    expect(saveRouteEdit(db, edit, ME, SAVED_AT, newId)).toBe(NEW_VERSION);

    expect(db.select().from(routes).get()).toMatchObject({
      name: 'Éjszakai kör',
      order_mode: 'fixed',
      current_version_id: NEW_VERSION,
      updated_at: SAVED_AT,
    });
    expect(db.select().from(checkpoints).where(eq(checkpoints.id, BACK)).get()).toMatchObject({
      name: 'Hátsó kapu – sorompó',
      instruction: 'Lent van?',
      updated_at: SAVED_AT,
    });
    // The point taken out stays a checkpoint of the site.
    expect(db.select({ id: checkpoints.id }).from(checkpoints).all()).toHaveLength(3);
    expect(db.select().from(routeVersions).where(eq(routeVersions.id, NEW_VERSION)).get()).toEqual({
      id: NEW_VERSION,
      route_id: ROUTE,
      version: 5,
      walk_duration_s: 215,
      created_by: ME,
      created_at: SAVED_AT,
    });
    expect(versionPoints(NEW_VERSION)).toEqual([
      { checkpoint_id: GATE, walk: null },
      { checkpoint_id: BACK, walk: 215 },
    ]);
    // The old version stays as it was: a round in progress keeps using it.
    expect(versionPoints(OLD_VERSION)).toHaveLength(3);

    const calls = queued();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `PATCH /checkpoints/${BACK}`,
      `PATCH /routes/${ROUTE}`,
      `POST /routes/${ROUTE}/versions`,
    ]);
    expect(calls.map((call) => call.body)).toEqual([
      { name: 'Hátsó kapu – sorompó', instruction: 'Lent van?' },
      { order_mode: 'fixed' },
      {
        id: NEW_VERSION,
        walk_duration_s: 215,
        checkpoints: [
          { checkpoint_id: GATE, walk_time_from_prev_s: null },
          { checkpoint_id: BACK, walk_time_from_prev_s: 215 },
        ],
      },
    ]);
    for (const call of calls) expect(schemaErrors(call.body_schema as SchemaPath, call.body)).toEqual([]);
  });

  it('uploads a new photo before the checkpoint that gets it', () => {
    const { files } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');
    files.set(photoFile(PHOTO).uri, { size: 1234, modifiedAtMs: 0 });
    const photo: PhotoFile = {
      id: PHOTO,
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size_bytes: 1234,
      local_uri: photoFile(PHOTO).uri,
      taken_at: SAVED_AT,
    };
    const edit = updateEditPoint(beginRouteEdit(base()), GATE, { name: 'Kapu', instruction: '', photo: { kind: 'new', photo } });

    saveRouteEdit(db, edit, ME, SAVED_AT, newId);

    expect(db.select({ id: media.id, owner_type: media.owner_type, owner_id: media.owner_id }).from(media).all()).toEqual([
      { id: PHOTO, owner_type: 'checkpoint', owner_id: GATE },
    ]);
    expect(db.select({ photo: checkpoints.photo_media_id }).from(checkpoints).where(eq(checkpoints.id, GATE)).get()).toEqual({
      photo: PHOTO,
    });
    const calls = queued();
    expect(calls.map((call) => [call.path, call.media_id])).toEqual([
      [`/media/${PHOTO}`, PHOTO],
      [`/checkpoints/${GATE}`, null],
      [`/routes/${ROUTE}/versions`, null],
    ]);
    expect(calls[1]!.body).toEqual({ photo_media_id: PHOTO });
    // The same points, with the walk as it was.
    expect(versionPoints(NEW_VERSION)).toEqual(versionPoints(OLD_VERSION));
  });

  it('sends the acting supervisor on the site phone', () => {
    useSession.setState({
      mode: 'site_phone',
      deviceId: '019a2b3c-4d5e-7f00-8a00-000000000004',
      activeUser: { id: ME, role: 'supervisor' },
    });
    saveRouteEdit(db, reorderEditPoints(beginRouteEdit(base()), [STORE, GATE, BACK]), ME, SAVED_AT, newId);
    expect(new Set(db.select({ acting: outbox.acting_user_id }).from(outbox).all())).toEqual(new Set([{ acting: ME }]));
  });

  it('changes nothing if the route has another current version by now', () => {
    const edit = removeEditPoint(beginRouteEdit(base()), STORE);
    // A pull brought another supervisor's version meanwhile.
    version('019a2b3c-4d5e-7f00-8a00-0000000000d5', 5, [[STORE, null]]);
    db.update(routes).set({ current_version_id: '019a2b3c-4d5e-7f00-8a00-0000000000d5' }).run();

    expect(() => saveRouteEdit(db, edit, ME, SAVED_AT, newId)).toThrow(expect.objectContaining({ code: 'stale' }));
    expect(queued()).toEqual([]);
    expect(db.select().from(routeVersions).all()).toHaveLength(3);
  });

  it('changes nothing without a change', () => {
    expect(() => saveRouteEdit(db, beginRouteEdit(base()), ME, SAVED_AT, newId)).toThrow(RouteEditError);
    expect(queued()).toEqual([]);
  });

  it("gets the number the server gives it, also when another supervisor's version took the estimated one", () => {
    saveRouteEdit(db, removeEditPoint(beginRouteEdit(base()), STORE), ME, SAVED_AT, newId);
    expect(nextVersionNumber(db, ROUTE)).toBe(6);
    const theirs = {
      id: '019a2b3c-4d5e-7f00-8a00-0000000000d5',
      route_id: ROUTE,
      version: 5,
      walk_duration_s: 300,
      created_by: OTHER,
      created_at: '2026-11-03T08:59:00.000Z',
    };

    // Another supervisor's version 5, then the response to this one: 6.
    db.transaction((tx) => storeServerRecords(tx, { route_versions: [theirs] }));
    db.delete(outbox).run();
    db.transaction((tx) =>
      storeServerRecords(tx, {
        route_versions: [{ id: NEW_VERSION, route_id: ROUTE, version: 6, walk_duration_s: 215, created_by: ME, created_at: SAVED_AT }],
      }),
    );

    expect(
      db
        .select({ id: routeVersions.id, version: routeVersions.version })
        .from(routeVersions)
        .orderBy(asc(routeVersions.version))
        .all()
        .slice(-2),
    ).toEqual([
      { id: theirs.id, version: 5 },
      { id: NEW_VERSION, version: 6 },
    ]);
  });
});
