import type { LocationFix } from '@/chain/payloads';

import {
  addExistingPoint,
  addNewPoint,
  checkPointDetails,
  elapsedMs,
  readTrainingTag,
  removePoint,
  secondsBetween,
  setOrderMode,
  setRouteName,
  startTraining,
  takenTags,
  trainingSave,
  TrainingError,
  updatePoint,
  walkDuration,
  walkTimes,
  type NewTagScan,
  type SiteCheckpoint,
  type TrainingDraft,
  type TrainingInstant,
  type TrainingRead,
} from './training';

const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const BOOT = 'android-boot:12';
const GATE: SiteCheckpoint = {
  id: '019a2b3c-4d5e-7f00-8a00-0000000000c1',
  name: 'Kapu',
  tag_uid: '04A1B2C3D4E501',
  qr_payload: 'waypost:cp:019a2b3c-4d5e-7f00-8a00-0000000000c1:AbCdEfGhIjKlMnOp',
  active: true,
};
const STORE: SiteCheckpoint = {
  id: '019a2b3c-4d5e-7f00-8a00-0000000000c2',
  name: 'Raktár',
  tag_uid: '04A1B2C3D4E502',
  qr_payload: null,
  active: false,
};
const SITE_CHECKPOINTS = [GATE, STORE];
const FIX: LocationFix = { latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null };

/** A moment s seconds after the start of the walk (uptime 1 000 000 ms). */
const at = (s: number, boot = BOOT): TrainingInstant => ({ uptime_ms: 1_000_000 + s * 1000, boot_id: boot });

let nextId = 0;
const newId = () => `019a2b3c-4d5e-7f00-8b00-${String((nextId += 1)).padStart(12, '0')}`;

beforeEach(() => {
  nextId = 0;
});

function draftOf(route: 'new' | 'existing' = 'existing'): TrainingDraft {
  return startTraining({
    site_id: SITE,
    supervisor_id: SUPERVISOR,
    route: { id: ROUTE, name: route === 'new' ? '' : 'Éjszakai kör', order_mode: 'free' },
    saved_order_mode: route === 'new' ? null : 'free',
    started: at(-30),
  });
}

function expectRead<K extends TrainingRead['kind']>(read: TrainingRead, kind: K): Extract<TrainingRead, { kind: K }> {
  expect(read.kind).toBe(kind);
  return read as Extract<TrainingRead, { kind: K }>;
}

/** Scans an unknown NFC tag at s seconds and adds it as a new point. */
function withNewPoint(draft: TrainingDraft, uid: string, s: number, name = `Pont ${uid.slice(-2)}`): TrainingDraft {
  const read = expectRead(readTrainingTag(draft, SITE_CHECKPOINTS, { method: 'nfc', tag_uid: uid, ndef_raw: null }, at(s), FIX), 'new_tag');
  return addNewPoint(draft, read.scan, { name, instruction: '' }, newId);
}

describe('reading a tag', () => {
  it('makes a new point of an unknown NFC tag, at the location of the scan', () => {
    const read = readTrainingTag(
      draftOf(),
      SITE_CHECKPOINTS,
      { method: 'nfc', tag_uid: '04:a1:b2:c3:d4:e5:99', ndef_raw: null },
      at(0),
      FIX,
    );
    expect(read).toEqual({
      kind: 'new_tag',
      scan: { tag_uid: '04A1B2C3D4E599', location: { lat_e7: 474979000, lng_e7: 190402000, accuracy_dm: 42 }, scanned: at(0) },
    });
  });

  it('keeps no location without a fix, and none of a mocked one', () => {
    const nfc = { method: 'nfc' as const, tag_uid: '04A1B2C3D4E599', ndef_raw: null };
    const noLocation = { lat_e7: null, lng_e7: null, accuracy_dm: null };
    expect(expectRead(readTrainingTag(draftOf(), [], nfc, at(0), null), 'new_tag').scan.location).toEqual(noLocation);
    expect(expectRead(readTrainingTag(draftOf(), [], nfc, at(0), { ...FIX, mocked: true }), 'new_tag').scan.location).toEqual(noLocation);
  });

  it('offers the checkpoint whose tag it is, inactive ones too', () => {
    expect(readTrainingTag(draftOf(), SITE_CHECKPOINTS, { method: 'nfc', tag_uid: '04a1b2c3d4e501', ndef_raw: null }, at(0), FIX)).toEqual({
      kind: 'existing_checkpoint',
      scan: { checkpoint: GATE, scanned: at(0) },
    });
    const read = readTrainingTag(draftOf(), SITE_CHECKPOINTS, { method: 'nfc', tag_uid: STORE.tag_uid!, ndef_raw: null }, at(0), FIX);
    expect(expectRead(read, 'existing_checkpoint').scan.checkpoint).toBe(STORE);
  });

  it('adds an existing checkpoint by its QR code, but makes no new point of one', () => {
    const qr = (qr_payload: string) => readTrainingTag(draftOf(), SITE_CHECKPOINTS, { method: 'qr', qr_payload }, at(0), FIX);
    expect(expectRead(qr(GATE.qr_payload!), 'existing_checkpoint').scan.checkpoint).toBe(GATE);
    expect(qr('waypost:cp:019a2b3c-4d5e-7f00-8a00-0000000000ff:AbCdEfGhIjKlMnOp')).toEqual({ kind: 'unknown_qr' });
  });

  it('tells a tag without a valid UID', () => {
    expect(readTrainingTag(draftOf(), [], { method: 'nfc', tag_uid: 'not-a-uid', ndef_raw: null }, at(0), FIX)).toEqual({
      kind: 'unreadable',
    });
  });

  it('does not take a tag twice: a new point, an added checkpoint', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E599', 0, 'Hátsó kapu');
    draft = addExistingPoint(draft, { checkpoint: GATE, scanned: at(60) });

    const again = (uid: string) => readTrainingTag(draft, SITE_CHECKPOINTS, { method: 'nfc', tag_uid: uid, ndef_raw: null }, at(90), FIX);
    expect(again('04A1B2C3D4E599')).toEqual({ kind: 'in_draft', position: 1, name: 'Hátsó kapu' });
    expect(again(GATE.tag_uid!)).toEqual({ kind: 'in_draft', position: 2, name: 'Kapu' });
    expect(readTrainingTag(draft, SITE_CHECKPOINTS, { method: 'qr', qr_payload: GATE.qr_payload! }, at(90), FIX)).toEqual({
      kind: 'in_draft',
      position: 2,
      name: 'Kapu',
    });
  });
});

describe('the points of the draft', () => {
  const scan: NewTagScan = { tag_uid: '04A1B2C3D4E599', location: { lat_e7: null, lng_e7: null, accuracy_dm: null }, scanned: at(0) };

  it('need a name; the details are trimmed, an empty instruction is none', () => {
    expect(checkPointDetails({ name: '  ', instruction: '' })).toEqual({ name: 'missing' });
    expect(checkPointDetails({ name: 'Kapu', instruction: '' })).toBeNull();
    expect(() => addNewPoint(draftOf(), scan, { name: ' ', instruction: 'Zárva?' }, newId)).toThrow(
      expect.objectContaining({ code: 'name_required' }),
    );

    const draft = addNewPoint(draftOf(), scan, { name: '  Hátsó kapu ', instruction: '   ' }, newId);
    expect(draft.points).toEqual([
      {
        kind: 'new',
        checkpoint_id: '019a2b3c-4d5e-7f00-8b00-000000000001',
        tag_uid: '04A1B2C3D4E599',
        name: 'Hátsó kapu',
        instruction: null,
        location: scan.location,
        scanned: at(0),
      },
    ]);
    expect(updatePoint(draft, draft.points[0]!.checkpoint_id, { name: 'Kapu 2', instruction: ' Zárva? ' }).points[0]).toMatchObject({
      name: 'Kapu 2',
      instruction: 'Zárva?',
    });
  });

  it('do not take the same tag or checkpoint twice', () => {
    const draft = addExistingPoint(addNewPoint(draftOf(), scan, { name: 'Hátsó kapu', instruction: '' }, newId), {
      checkpoint: GATE,
      scanned: at(10),
    });
    expect(() => addNewPoint(draft, scan, { name: 'Másik', instruction: '' }, newId)).toThrow(
      expect.objectContaining({ code: 'in_draft' }),
    );
    expect(() => addExistingPoint(draft, { checkpoint: GATE, scanned: at(20) })).toThrow(expect.objectContaining({ code: 'in_draft' }));
  });

  it('change only a new checkpoint, and only one in the draft', () => {
    const draft = addExistingPoint(draftOf(), { checkpoint: GATE, scanned: at(0) });
    expect(() => updatePoint(draft, GATE.id, { name: 'Új név', instruction: '' })).toThrow(expect.objectContaining({ code: 'not_new' }));
    expect(() => updatePoint(draft, STORE.id, { name: 'Új név', instruction: '' })).toThrow(
      expect.objectContaining({ code: 'not_in_draft' }),
    );
    expect(() => removePoint(draft, STORE.id)).toThrow(TrainingError);
  });

  it('can be taken out, and the tag can be scanned again', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E599', 0);
    draft = removePoint(draft, draft.points[0]!.checkpoint_id);
    expect(draft.points).toEqual([]);
    expect(readTrainingTag(draft, SITE_CHECKPOINTS, { method: 'nfc', tag_uid: '04A1B2C3D4E599', ndef_raw: null }, at(5), FIX).kind).toBe(
      'new_tag',
    );
  });
});

describe('the measured walk', () => {
  it('is the time from scan to scan, and from the first to the last', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E597', 0);
    draft = withNewPoint(draft, '04A1B2C3D4E598', 95.4);
    draft = addExistingPoint(draft, { checkpoint: GATE, scanned: at(220.6) });
    expect(walkTimes(draft)).toEqual([null, 95, 125]);
    expect(walkDuration(draft)).toBe(221);
  });

  it('is measured between the points that remain', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E597', 0);
    draft = withNewPoint(draft, '04A1B2C3D4E598', 60);
    draft = withNewPoint(draft, '04A1B2C3D4E599', 150);
    draft = removePoint(draft, draft.points[1]!.checkpoint_id);
    expect(walkTimes(draft)).toEqual([null, 150]);
    draft = removePoint(draft, draft.points[0]!.checkpoint_id);
    expect(walkTimes(draft)).toEqual([null]);
    expect(walkDuration(draft)).toBe(0);
  });

  it('is not known across a reboot', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E597', 0);
    draft = addExistingPoint(draft, { checkpoint: GATE, scanned: at(10, 'android-boot:13') });
    expect(walkTimes(draft)).toEqual([null, null]);
    expect(walkDuration(draft)).toBeNull();
    expect(secondsBetween(at(0), at(10, 'android-boot:13'))).toBeNull();
    expect(elapsedMs(draft, at(10, 'android-boot:13'))).toBeNull();
  });

  it('has nothing to measure without points; the elapsed time runs from the start', () => {
    expect(walkDuration(draftOf())).toBeNull();
    expect(walkTimes(draftOf())).toEqual([]);
    expect(elapsedMs(draftOf(), at(0))).toBe(30_000);
  });
});

describe('the save', () => {
  it('creates the new checkpoints and the version of an existing route', () => {
    let draft = withNewPoint(draftOf(), '04A1B2C3D4E599', 0, 'Hátsó kapu');
    draft = addExistingPoint(draft, { checkpoint: GATE, scanned: at(80) });
    draft = addExistingPoint(draft, { checkpoint: STORE, scanned: at(200) });

    expect(trainingSave(draft, SITE_CHECKPOINTS, newId)).toEqual({
      createRoute: null,
      updateRoute: null,
      createCheckpoints: [
        {
          id: '019a2b3c-4d5e-7f00-8b00-000000000001',
          site_id: SITE,
          name: 'Hátsó kapu',
          instruction: null,
          tag_type: 'nfc',
          tag_uid: '04A1B2C3D4E599',
          lat_e7: 474979000,
          lng_e7: 190402000,
          accuracy_dm: 42,
          active: true,
        },
      ],
      // The inactive checkpoint is switched on, so a guard's scan finds it.
      activateCheckpoints: [STORE.id],
      createVersion: {
        id: '019a2b3c-4d5e-7f00-8b00-000000000002',
        walk_duration_s: 200,
        checkpoints: [
          { checkpoint_id: '019a2b3c-4d5e-7f00-8b00-000000000001', walk_time_from_prev_s: null },
          { checkpoint_id: GATE.id, walk_time_from_prev_s: 80 },
          { checkpoint_id: STORE.id, walk_time_from_prev_s: 120 },
        ],
      },
    });
  });

  it('creates a new route with its name and order mode', () => {
    const draft = setOrderMode(
      setRouteName(addExistingPoint(draftOf('new'), { checkpoint: GATE, scanned: at(0) }), '  Hajnali kör '),
      'fixed',
    );
    expect(() => trainingSave(setRouteName(draft, ' '), SITE_CHECKPOINTS, newId)).toThrow(
      expect.objectContaining({ code: 'route_name_required' }),
    );
    const save = trainingSave(draft, SITE_CHECKPOINTS, newId);
    expect(save.createRoute).toEqual({ id: ROUTE, site_id: SITE, name: 'Hajnali kör', order_mode: 'fixed', active: true });
    expect(save.updateRoute).toBeNull();
    expect(save.createVersion.checkpoints).toEqual([{ checkpoint_id: GATE.id, walk_time_from_prev_s: null }]);
  });

  it('changes the order mode of an existing route if it was switched', () => {
    const draft = setOrderMode(addExistingPoint(draftOf(), { checkpoint: GATE, scanned: at(0) }), 'fixed');
    expect(trainingSave(draft, SITE_CHECKPOINTS, newId).updateRoute).toEqual({ id: ROUTE, order_mode: 'fixed' });
  });

  it('needs a point, and at most 500', () => {
    expect(() => trainingSave(draftOf(), SITE_CHECKPOINTS, newId)).toThrow(expect.objectContaining({ code: 'no_points' }));
    let draft = draftOf();
    for (let i = 0; i <= 500; i += 1) draft = withNewPoint(draft, `04A1B2C3${i.toString(16).toUpperCase().padStart(6, '0')}`, i);
    expect(() => trainingSave(draft, SITE_CHECKPOINTS, newId)).toThrow(expect.objectContaining({ code: 'too_many_points' }));
  });

  it('is refused if a checkpoint of the site has taken the tag of a new point since the scan', () => {
    const draft = withNewPoint(draftOf(), '04A1B2C3D4E599', 0);
    const newPoint = draft.points[0]!.checkpoint_id;
    const arrived: SiteCheckpoint = {
      id: '019a2b3c-4d5e-7f00-8a00-0000000000c9',
      name: 'Bejárat',
      tag_uid: '04A1B2C3D4E599',
      qr_payload: null,
      active: true,
    };
    // The new point itself, stored by an earlier save, does not count.
    expect(takenTags(draft, [{ ...arrived, id: newPoint }])).toEqual([]);
    expect(takenTags(draft, [...SITE_CHECKPOINTS, arrived])).toEqual([newPoint]);

    const error = (() => {
      try {
        trainingSave(draft, [...SITE_CHECKPOINTS, arrived], newId);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(TrainingError);
    expect(error).toMatchObject({ code: 'tag_taken', checkpointIds: [newPoint] });
  });
});
