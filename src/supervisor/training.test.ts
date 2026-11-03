import type { SchemaPath } from '@waypost/schema';
import { asc, sql } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { PhotoFile } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { checkpoints, media, outbox, routes, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import {
  addExistingPoint,
  addNewPoint,
  readTrainingTag,
  removePoint,
  setOrderMode,
  setRouteName,
  TrainingError,
  updatePoint,
  type TrainingDraft,
} from '@/domain/training';
import { photoFile } from '@/photo/files';
import { schemaErrors } from '@/schema/validation';

import {
  beginTraining,
  discardTrainingDraft,
  existingScanOf,
  loadTrainingDraft,
  parsePendingScan,
  pendingScanOf,
  pendingScanParam,
  readForTraining,
  saveTraining,
  siteCheckpoints,
  storedTrainingDraft,
  storeTrainingDraft,
} from './training';

jest.mock('expo-file-system');
const { files: mockedFiles } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

const AT = '2026-10-27T10:05:12.345Z';
const SAVED_AT = '2026-10-27T10:35:00.000Z';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';
const OTHER = '019a2b3c-4d5e-7f00-8a00-000000000003';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a2';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const OLD_VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const STORE = '019a2b3c-4d5e-7f00-8a00-0000000000c2';
const ELSEWHERE = '019a2b3c-4d5e-7f00-8a00-0000000000c3';
const started = { uptime_ms: 1_000_000, boot_id: 'android-boot:12' };
const after = (s: number) => ({ uptime_ms: 1_000_000 + s * 1000, boot_id: 'android-boot:12' });

let db: Database;
let nextId = 0;
const newId = () => `019a2b3c-4d5e-7f00-8b00-${String((nextId += 1)).padStart(12, '0')}`;

function checkpoint(id: string, siteId: string, name: string, tag_uid: string, active = true) {
  db.insert(checkpoints)
    .values({
      id,
      site_id: siteId,
      name,
      instruction: null,
      tag_type: 'nfc',
      tag_uid,
      qr_payload: `waypost:cp:${id}:AbCdEfGhIjKlMnOp`,
      lat_e7: null,
      lng_e7: null,
      accuracy_dm: null,
      photo_media_id: null,
      active,
      created_at: AT,
      updated_at: AT,
    })
    .run();
}

beforeEach(async () => {
  nextId = 0;
  ({ db } = await createTestDatabase());
  useSession.setState({ mode: 'supervisor_phone', deviceId: null, activeUser: null, shiftStart: null });
  checkpoint(GATE, SITE, 'Kapu', '04A1B2C3D4E501');
  checkpoint(STORE, SITE, 'Raktár', '04A1B2C3D4E502', false);
  // The same tag on another site: tags are unique within a site only.
  checkpoint(ELSEWHERE, OTHER_SITE, 'Porta', '04A1B2C3D4E599');
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
  db.insert(routeVersions)
    .values({ id: OLD_VERSION, route_id: ROUTE, version: 3, walk_duration_s: 900, created_by: OTHER, created_at: AT })
    .run();
  db.insert(routeVersionCheckpoints)
    .values({ route_version_id: OLD_VERSION, checkpoint_id: GATE, position: 1, walk_time_from_prev_s: null })
    .run();
});

const PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e1';
/** A photo taken on the training's point screen: its file is in the photo directory. */
function photo(id = PHOTO): PhotoFile {
  mockedFiles.set(photoFile(id).uri, { size: 1234, modifiedAtMs: 0 });
  return { id, sha256: 'ab'.repeat(32), mime: 'image/jpeg', size_bytes: 1234, local_uri: photoFile(id).uri, taken_at: AT };
}
const hasFile = (id: string) => mockedFiles.has(photoFile(id).uri);

/** The walk: a new tag (with a location and maybe a photo), then the gate, then the inactive store. */
function walk(draft: TrainingDraft, newPhoto: PhotoFile | null = null): TrainingDraft {
  const fix = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };
  const read = readTrainingTag(
    draft,
    siteCheckpoints(db, SITE),
    { method: 'nfc', tag_uid: '04A1B2C3D4E599', ndef_raw: null },
    after(0),
    fix,
  );
  if (read.kind !== 'new_tag') throw new Error(`Unexpected read: ${read.kind}`);
  let next = addNewPoint(draft, read.scan, { name: 'Hátsó kapu', instruction: 'Zárva van?', photo: newPhoto }, newId);
  next = addExistingPoint(next, { checkpoint: siteCheckpoints(db, SITE).find((c) => c.id === GATE)!, scanned: after(95) });
  return addExistingPoint(next, { checkpoint: siteCheckpoints(db, SITE).find((c) => c.id === STORE)!, scanned: after(215) });
}

function queued() {
  return db
    .select({ method: outbox.method, path: outbox.path, body: outbox.body, body_schema: outbox.body_schema, record_ids: outbox.record_ids })
    .from(outbox)
    .orderBy(sql`rowid`)
    .all();
}

describe('the checkpoints of a site', () => {
  it('are every checkpoint of the site, active or not', () => {
    expect(siteCheckpoints(db, SITE).map((c) => [c.name, c.active])).toEqual([
      ['Kapu', true],
      ['Raktár', false],
    ]);
  });
});

describe('the draft', () => {
  it('of an existing route starts with its order mode, and is kept', () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started });
    expect(draft).toEqual({
      site_id: SITE,
      supervisor_id: ME,
      route: { id: ROUTE, name: 'Éjszakai kör', order_mode: 'free' },
      saved_order_mode: 'free',
      started,
      points: [],
      adding: null,
    });
    expect(loadTrainingDraft(db, ME)).toEqual(draft);
  });

  it('of a new route has a new ID and no name yet', () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: null, supervisorId: ME, started });
    expect(draft.route).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: '', order_mode: 'free' });
    expect(draft.saved_order_mode).toBeNull();
  });

  it('is only for a route of the site', () => {
    expect(() => beginTraining(db, { siteId: OTHER_SITE, routeId: ROUTE, supervisorId: ME, started })).toThrow('is not on site');
  });

  it("is not another supervisor's, and can be discarded", () => {
    beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started });
    expect(loadTrainingDraft(db, OTHER)).toBeNull();
    // The phone keeps one draft: a new training replaces it, whoever's it is.
    expect(storedTrainingDraft(db)).toMatchObject({ supervisor_id: ME });
    discardTrainingDraft(db);
    expect(loadTrainingDraft(db, ME)).toBeNull();
  });

  it('keeps the files of its photos, and deletes those that leave it', () => {
    const draft = walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }), photo());
    storeTrainingDraft(db, draft);
    expect(hasFile(PHOTO)).toBe(true);
    // The point gets another photo: the first one goes.
    const second = photo('019a2b3c-4d5e-7f00-8a00-0000000000e2');
    const [point] = draft.points;
    storeTrainingDraft(db, updatePoint(draft, point!.checkpoint_id, { name: 'Hátsó kapu', instruction: '', photo: second }));
    expect(hasFile(PHOTO)).toBe(false);
    expect(hasFile(second.id)).toBe(true);
    discardTrainingDraft(db);
    expect(hasFile(second.id)).toBe(false);
  });

  it('loses its photos when a new training replaces it', () => {
    storeTrainingDraft(db, walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }), photo()));
    beginTraining(db, { siteId: SITE, routeId: null, supervisorId: OTHER, started });
    expect(hasFile(PHOTO)).toBe(false);
  });

  it('loses the photo of a removed point', () => {
    const draft = walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }), photo());
    storeTrainingDraft(db, draft);
    storeTrainingDraft(db, removePoint(draft, draft.points[0]!.checkpoint_id));
    expect(hasFile(PHOTO)).toBe(false);
  });
});

describe('a scan waiting on the point screen', () => {
  const nfc = (tag_uid: string) => ({ method: 'nfc' as const, tag_uid, ndef_raw: null });

  it('of a new tag travels as a param with its location', () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started });
    const fix = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };
    const outcome = readForTraining(db, draft, nfc('04:a1:b2:c3:d4:e5:77'), after(30), fix);
    const pending = pendingScanOf(outcome, 'nfc');
    expect(pending).toEqual({
      kind: 'new',
      scan: { tag_uid: '04A1B2C3D4E577', location: { lat_e7: 474979000, lng_e7: 190402000, accuracy_dm: 42 }, scanned: after(30) },
    });
    expect(parsePendingScan(pendingScanParam(pending!))).toEqual(pending);
  });

  it('of a checkpoint of the site keeps how it was read, and finds the checkpoint again', () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started });
    const outcome = readForTraining(db, draft, { method: 'qr', qr_payload: `waypost:cp:${STORE}:AbCdEfGhIjKlMnOp` }, after(5), null);
    const pending = parsePendingScan(pendingScanParam(pendingScanOf(outcome, 'qr')!));
    expect(pending).toEqual({ kind: 'existing', checkpoint_id: STORE, method: 'qr', scanned: after(5) });
    expect(existingScanOf(db, draft, pending as Extract<typeof pending, { kind: 'existing' }>)).toEqual({
      checkpoint: {
        id: STORE,
        name: 'Raktár',
        tag_uid: '04A1B2C3D4E502',
        qr_payload: `waypost:cp:${STORE}:AbCdEfGhIjKlMnOp`,
        active: false,
      },
      scanned: after(5),
    });
    db.delete(checkpoints).run();
    expect(existingScanOf(db, draft, pending as Extract<typeof pending, { kind: 'existing' }>)).toBeNull();
  });

  it('is none for a read that brings no point', () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started });
    expect(pendingScanOf(readForTraining(db, draft, { method: 'qr', qr_payload: 'waypost:cp:x:y' }, after(1), null), 'qr')).toBeNull();
    expect(pendingScanOf(readForTraining(db, draft, nfc('zz'), after(1), null), 'nfc')).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['not JSON', '{'],
    ['not an object', '3'],
    ['of an unknown kind', JSON.stringify({ kind: 'other' })],
    ['a new tag without its time', JSON.stringify({ kind: 'new', scan: { tag_uid: '04', location: {} } })],
    [
      'a new tag with a float location',
      JSON.stringify({
        kind: 'new',
        scan: { tag_uid: '04', location: { lat_e7: 1.5, lng_e7: null, accuracy_dm: null }, scanned: started },
      }),
    ],
    ['a checkpoint read by hand', JSON.stringify({ kind: 'existing', checkpoint_id: GATE, method: 'manual', scanned: started })],
  ])('is not taken from a param %s', (_case, param) => {
    expect(parsePendingScan(param)).toBeNull();
  });
});

describe('saving', () => {
  it('stores the new version of an existing route locally, and queues its calls in order', () => {
    const draft = walk(setOrderMode(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }), 'fixed'));

    const versionId = saveTraining(db, draft, SAVED_AT, newId);

    const NEW_POINT = '019a2b3c-4d5e-7f00-8b00-000000000001';
    expect(versionId).toBe('019a2b3c-4d5e-7f00-8b00-000000000002');
    expect(db.select().from(routes).get()).toMatchObject({ order_mode: 'fixed', current_version_id: versionId, updated_at: SAVED_AT });
    expect(db.select().from(routeVersions).orderBy(asc(routeVersions.version)).all()).toEqual([
      expect.objectContaining({ id: OLD_VERSION, version: 3 }),
      { id: versionId, route_id: ROUTE, version: 4, walk_duration_s: 215, created_by: ME, created_at: SAVED_AT },
    ]);
    expect(
      db
        .select()
        .from(routeVersionCheckpoints)
        .where(sql`route_version_id = ${versionId}`)
        .orderBy(asc(routeVersionCheckpoints.position))
        .all(),
    ).toEqual([
      { route_version_id: versionId, checkpoint_id: NEW_POINT, position: 1, walk_time_from_prev_s: null },
      { route_version_id: versionId, checkpoint_id: GATE, position: 2, walk_time_from_prev_s: 95 },
      { route_version_id: versionId, checkpoint_id: STORE, position: 3, walk_time_from_prev_s: 120 },
    ]);
    expect(
      db
        .select()
        .from(checkpoints)
        .where(sql`id = ${NEW_POINT}`)
        .get(),
    ).toEqual({
      id: NEW_POINT,
      site_id: SITE,
      name: 'Hátsó kapu',
      instruction: 'Zárva van?',
      tag_type: 'nfc',
      tag_uid: '04A1B2C3D4E599',
      qr_payload: null,
      lat_e7: 474979000,
      lng_e7: 190402000,
      accuracy_dm: 42,
      photo_media_id: null,
      active: true,
      created_at: SAVED_AT,
      updated_at: SAVED_AT,
    });
    expect(
      db
        .select({ active: checkpoints.active })
        .from(checkpoints)
        .where(sql`id = ${STORE}`)
        .get(),
    ).toEqual({ active: true });
    // The draft is gone with the save.
    expect(getKv(db, 'training.draft')).toBeNull();

    const calls = queued();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /checkpoints',
      `PATCH /checkpoints/${STORE}`,
      `PATCH /routes/${ROUTE}`,
      `POST /routes/${ROUTE}/versions`,
    ]);
    expect(calls[0]!.body).toMatchObject({ id: NEW_POINT, site_id: SITE, tag_uid: '04A1B2C3D4E599' });
    expect(calls[0]!.body).not.toHaveProperty('qr_payload');
    expect(calls[1]!.body).toEqual({ active: true });
    expect(calls[2]!.body).toEqual({ order_mode: 'fixed' });
    expect(calls[3]!.body).toEqual({
      id: versionId,
      walk_duration_s: 215,
      checkpoints: [
        { checkpoint_id: NEW_POINT, walk_time_from_prev_s: null },
        { checkpoint_id: GATE, walk_time_from_prev_s: 95 },
        { checkpoint_id: STORE, walk_time_from_prev_s: 120 },
      ],
    });
    expect(calls[3]!.record_ids).toEqual([versionId, ROUTE]);
    for (const call of calls) expect(schemaErrors(call.body_schema as SchemaPath, call.body)).toEqual([]);
  });

  it('creates a new route first', () => {
    const draft = setRouteName(walk(beginTraining(db, { siteId: SITE, routeId: null, supervisorId: ME, started })), 'Hajnali kör');
    const versionId = saveTraining(db, draft, SAVED_AT, newId);

    const route = db
      .select()
      .from(routes)
      .where(sql`id = ${draft.route.id}`)
      .get();
    expect(route).toEqual({
      id: draft.route.id,
      site_id: SITE,
      name: 'Hajnali kör',
      order_mode: 'free',
      current_version_id: versionId,
      active: true,
      created_at: SAVED_AT,
      updated_at: SAVED_AT,
    });
    expect(
      db
        .select({ version: routeVersions.version })
        .from(routeVersions)
        .where(sql`id = ${versionId}`)
        .get(),
    ).toEqual({ version: 1 });
    const calls = queued();
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /routes',
      'POST /checkpoints',
      `PATCH /checkpoints/${STORE}`,
      `POST /routes/${draft.route.id}/versions`,
    ]);
    for (const call of calls) expect(schemaErrors(call.body_schema as SchemaPath, call.body)).toEqual([]);
  });

  it('uploads the photo of a new point before its checkpoint, with the checkpoint as its owner', () => {
    const draft = walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }), photo());
    storeTrainingDraft(db, draft);
    saveTraining(db, draft, SAVED_AT, newId);

    const NEW_POINT = '019a2b3c-4d5e-7f00-8b00-000000000001';
    // The save does not delete the photo: it is device data now.
    expect(hasFile(PHOTO)).toBe(true);
    expect(db.select().from(media).all()).toEqual([
      {
        id: PHOTO,
        device_id: null,
        owner_type: 'checkpoint',
        owner_id: NEW_POINT,
        sha256: 'ab'.repeat(32),
        mime: 'image/jpeg',
        size_bytes: 1234,
        local_uri: photoFile(PHOTO).uri,
        taken_at: AT,
        uploaded_at: null,
      },
    ]);
    expect(
      db
        .select({ photo: checkpoints.photo_media_id })
        .from(checkpoints)
        .where(sql`id = ${NEW_POINT}`)
        .get(),
    ).toEqual({ photo: PHOTO });
    const calls = db
      .select({ path: outbox.path, body: outbox.body, body_schema: outbox.body_schema, media_id: outbox.media_id })
      .from(outbox)
      .orderBy(sql`rowid`)
      .all();
    expect(calls.slice(0, 2)).toEqual([
      {
        path: `/media/${PHOTO}`,
        body: { sha256: 'ab'.repeat(32), owner_type: 'checkpoint', owner_id: NEW_POINT, taken_at: AT },
        body_schema: 'api/media-upload.request',
        media_id: PHOTO,
      },
      expect.objectContaining({ path: '/checkpoints', body: expect.objectContaining({ photo_media_id: PHOTO }), media_id: null }),
    ]);
    for (const call of calls) expect(schemaErrors(call.body_schema as SchemaPath, call.body)).toEqual([]);
  });

  it('sends the acting supervisor on the site phone', () => {
    useSession.setState({
      mode: 'site_phone',
      deviceId: '019a2b3c-4d5e-7f00-8a00-000000000004',
      activeUser: { id: ME, role: 'supervisor' },
    });
    saveTraining(db, walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started })), SAVED_AT, newId);
    expect(
      new Set(
        db
          .select({ acting: outbox.acting_user_id })
          .from(outbox)
          .all()
          .map((row) => row.acting),
      ),
    ).toEqual(new Set([ME]));
  });

  it('changes nothing if the tag of a new point was taken since the scan', () => {
    const draft = walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }));
    // A pull brought a checkpoint with the same tag meanwhile.
    checkpoint('019a2b3c-4d5e-7f00-8a00-0000000000c9', SITE, 'Bejárat', '04A1B2C3D4E599');

    expect(() => saveTraining(db, draft, SAVED_AT, newId)).toThrow(TrainingError);
    expect(queued()).toEqual([]);
    expect(db.select().from(routes).get()).toMatchObject({ current_version_id: OLD_VERSION });
    expect(db.select().from(routeVersions).all()).toHaveLength(1);
    // The draft stays, so the point can be fixed.
    expect(getKv(db, 'training.draft')).not.toBeNull();
  });

  it('is refused for a route that is gone from the phone', () => {
    const draft = walk(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started }));
    db.delete(routes).run();
    expect(() => saveTraining(db, draft, SAVED_AT, newId)).toThrow('is not on the phone any more');
    expect(queued()).toEqual([]);
  });
});

describe('a training of one point', () => {
  const NEW_TAG = '04A1B2C3D4E599';
  function addedPoint(draft: TrainingDraft): TrainingDraft {
    const read = readTrainingTag(draft, siteCheckpoints(db, SITE), { method: 'nfc', tag_uid: NEW_TAG, ndef_raw: null }, after(0), null);
    if (read.kind !== 'new_tag') throw new Error(`Unexpected read: ${read.kind}`);
    return addNewPoint(draft, read.scan, { name: 'Kazánház', instruction: '', photo: null }, newId);
  }

  it("starts from the route's current version", () => {
    const draft = beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started, adding: true });
    expect(draft.adding).toEqual({
      version_id: OLD_VERSION,
      walk_duration_s: 900,
      points: [{ checkpoint_id: GATE, name: 'Kapu', walk_time_from_prev_s: null }],
    });
    expect(storedTrainingDraft(db)).toEqual(draft);
  });

  it('is saved as the next version with the new point at the end', () => {
    const draft = addedPoint(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started, adding: true }));
    const versionId = saveTraining(db, draft, SAVED_AT, newId);

    expect(db.select().from(routes).get()).toMatchObject({ current_version_id: versionId, order_mode: 'free' });
    expect(
      db
        .select({ checkpoint_id: routeVersionCheckpoints.checkpoint_id, walk: routeVersionCheckpoints.walk_time_from_prev_s })
        .from(routeVersionCheckpoints)
        .where(sql`route_version_id = ${versionId}`)
        .orderBy(asc(routeVersionCheckpoints.position))
        .all(),
    ).toEqual([
      { checkpoint_id: GATE, walk: null },
      { checkpoint_id: '019a2b3c-4d5e-7f00-8b00-000000000001', walk: null },
    ]);
    expect(queued().map((call) => `${call.method} ${call.path}`)).toEqual(['POST /checkpoints', `POST /routes/${ROUTE}/versions`]);
    expect(queued()[1]!.body).toMatchObject({ walk_duration_s: 900 });
  });

  it('is not saved over a version that came meanwhile', () => {
    const draft = addedPoint(beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started, adding: true }));
    db.update(routes).set({ current_version_id: '019a2b3c-4d5e-7f00-8a00-0000000000d9' }).run();

    expect(() => saveTraining(db, draft, SAVED_AT, newId)).toThrow(expect.objectContaining({ code: 'stale' }));
    expect(queued()).toEqual([]);
    expect(getKv(db, 'training.draft')).not.toBeNull();
  });

  it('needs a version to add to', () => {
    db.update(routes).set({ current_version_id: null }).run();
    expect(() => beginTraining(db, { siteId: SITE, routeId: ROUTE, supervisorId: ME, started, adding: true })).toThrow('no version');
  });
});
