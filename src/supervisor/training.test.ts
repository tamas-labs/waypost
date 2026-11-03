import type { SchemaPath } from '@waypost/schema';
import { asc, sql } from 'drizzle-orm';

import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { checkpoints, outbox, routes, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import {
  addExistingPoint,
  addNewPoint,
  readTrainingTag,
  setOrderMode,
  setRouteName,
  TrainingError,
  type TrainingDraft,
} from '@/domain/training';
import { schemaErrors } from '@/schema/validation';

import { beginTraining, discardTrainingDraft, loadTrainingDraft, saveTraining, siteCheckpoints } from './training';

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

/** The walk: a new tag (with a location), then the gate, then the inactive store. */
function walk(draft: TrainingDraft): TrainingDraft {
  const fix = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };
  const read = readTrainingTag(
    draft,
    siteCheckpoints(db, SITE),
    { method: 'nfc', tag_uid: '04A1B2C3D4E599', ndef_raw: null },
    after(0),
    fix,
  );
  if (read.kind !== 'new_tag') throw new Error(`Unexpected read: ${read.kind}`);
  let next = addNewPoint(draft, read.scan, { name: 'Hátsó kapu', instruction: 'Zárva van?' }, newId);
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
    discardTrainingDraft(db);
    expect(loadTrainingDraft(db, ME)).toBeNull();
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
