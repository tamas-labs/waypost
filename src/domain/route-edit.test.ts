import type { PhotoFile } from '@/chain/payloads';
import { schemaErrors } from '@/schema/validation';

import {
  beginRouteEdit,
  editPhotos,
  editPointDetails,
  inheritedWalkDuration,
  inheritedWalkTimes,
  removeEditPoint,
  reorderEditPoints,
  RouteEditError,
  routeEditChanged,
  routeEditSave,
  setEditOrderMode,
  setEditRouteName,
  updateEditPoint,
  type RouteEdit,
  type RouteEditBase,
} from './route-edit';

const ROUTE = '019a2b3c-4d5e-7f00-8a00-0000000000b1';
const VERSION = '019a2b3c-4d5e-7f00-8a00-0000000000d1';
const A = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const B = '019a2b3c-4d5e-7f00-8a00-0000000000c2';
const C = '019a2b3c-4d5e-7f00-8a00-0000000000c3';
const D = '019a2b3c-4d5e-7f00-8a00-0000000000c4';
const SAVED_PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e1';
const NEW_PHOTO = '019a2b3c-4d5e-7f00-8a00-0000000000e2';
const NEW_VERSION = '019a2b3c-4d5e-7f00-8b00-000000000001';
const newId = () => NEW_VERSION;

/** A → B 60 s → C 90 s → D 120 s: a walk of 270 s. B has a photo, C an instruction. */
const base: RouteEditBase = {
  route: { id: ROUTE, name: 'Éjszakai kör', order_mode: 'free' },
  version_id: VERSION,
  version: 4,
  walk_duration_s: 270,
  points: [
    { checkpoint_id: A, name: 'Főbejárat', instruction: null, photo_media_id: null, walk_time_from_prev_s: null },
    { checkpoint_id: B, name: 'Porta', instruction: null, photo_media_id: SAVED_PHOTO, walk_time_from_prev_s: 60 },
    { checkpoint_id: C, name: 'Raktár', instruction: 'Zárva van?', photo_media_id: null, walk_time_from_prev_s: 90 },
    { checkpoint_id: D, name: 'Kazánház', instruction: null, photo_media_id: null, walk_time_from_prev_s: 120 },
  ],
};

const photo: PhotoFile = {
  id: NEW_PHOTO,
  sha256: 'ab'.repeat(32),
  mime: 'image/jpeg',
  size_bytes: 1234,
  local_uri: 'file:///documents/media/x.jpg',
  taken_at: '2026-11-03T10:00:00.000Z',
};

const times = (order: string[]) => inheritedWalkTimes(base, order);
const without = (edit: RouteEdit, ...ids: string[]) => ids.reduce(removeEditPoint, edit);

describe('the walk times', () => {
  it('stay as measured while the order is the same', () => {
    expect(times([A, B, C, D])).toEqual([null, 60, 90, 120]);
    expect(inheritedWalkDuration(base, [A, B, C, D])).toBe(270);
  });

  it('go through a removed point: the walk passed there', () => {
    expect(times([A, C, D])).toEqual([null, 150, 120]);
    expect(times([A, D])).toEqual([null, 270]);
    expect(inheritedWalkDuration(base, [A, C, D])).toBe(270);
  });

  it('are null where the order changed, and stay for the points that are still in a row', () => {
    expect(times([B, A, C, D])).toEqual([null, null, null, 120]);
    expect(times([B, C, D, A])).toEqual([null, 90, 120, null]);
    // C after A with B, still on the route, now behind them: not the walk that was measured.
    expect(times([A, C, B, D])).toEqual([null, null, null, null]);
  });

  it('lose the walk to a removed first point and from a removed last one', () => {
    expect(times([B, C, D])).toEqual([null, 90, 120]);
    expect(inheritedWalkDuration(base, [B, C, D])).toBe(210);
    expect(inheritedWalkDuration(base, [B, C])).toBe(90);
    expect(inheritedWalkDuration(base, [C])).toBe(0);
  });

  it('keep the measured walk after a change of the order: the same place, at most as long', () => {
    expect(inheritedWalkDuration(base, [D, C, B, A])).toBe(270);
    expect(inheritedWalkDuration(base, [B, A])).toBe(270);
  });

  it('are null where they were not measured', () => {
    const unmeasured: RouteEditBase = {
      ...base,
      // A reboot between B and C during the training.
      points: base.points.map((point) => (point.checkpoint_id === C ? { ...point, walk_time_from_prev_s: null } : point)),
    };
    expect(inheritedWalkTimes(unmeasured, [A, C, D])).toEqual([null, null, 120]);
    expect(inheritedWalkTimes(unmeasured, [A, B, D])).toEqual([null, 60, null]);
    // The walk to C is not known, so the duration stays as it was.
    expect(inheritedWalkDuration(unmeasured, [C, D])).toBe(270);
    expect(inheritedWalkDuration(unmeasured, [B, C, D])).toBe(210);
    expect(inheritedWalkDuration({ ...base, walk_duration_s: null }, [A, B])).toBeNull();
  });
});

describe('editing', () => {
  it('starts with the version as it is, and changes nothing yet', () => {
    const edit = beginRouteEdit(base);
    expect(edit.points.map((point) => point.checkpoint_id)).toEqual([A, B, C, D]);
    expect(editPointDetails(edit, B)).toEqual({ name: 'Porta', instruction: '', photo: { kind: 'saved', media_id: SAVED_PHOTO } });
    expect(editPointDetails(edit, C)).toEqual({ name: 'Raktár', instruction: 'Zárva van?', photo: null });
    expect(routeEditChanged(edit)).toBe(false);
    expect(() => routeEditSave(edit, newId)).toThrow(expect.objectContaining({ code: 'unchanged' }));
  });

  it('changes the details of a point, trimmed; a name is required', () => {
    const edit = updateEditPoint(beginRouteEdit(base), C, { name: '  Raktár 1 ', instruction: '  ', photo: null });
    expect(editPointDetails(edit, C)).toEqual({ name: 'Raktár 1', instruction: '', photo: null });
    expect(edit.points.find((point) => point.checkpoint_id === C)?.instruction).toBeNull();
    expect(() => updateEditPoint(edit, C, { name: ' ', instruction: '', photo: null })).toThrow(
      expect.objectContaining({ code: 'name_required' }),
    );
    expect(() => updateEditPoint(edit, '019a2b3c-4d5e-7f00-8a00-0000000000c9', { name: 'X', instruction: '', photo: null })).toThrow(
      expect.objectContaining({ code: 'not_in_route' }),
    );
  });

  it('changes nothing with the same details again', () => {
    const edit = updateEditPoint(beginRouteEdit(base), B, {
      name: 'Porta',
      instruction: '',
      photo: { kind: 'saved', media_id: SAVED_PHOTO },
    });
    expect(routeEditChanged(edit)).toBe(false);
  });

  it('reorders with the same points only, each once', () => {
    const edit = beginRouteEdit(base);
    expect(reorderEditPoints(edit, [D, C, B, A]).points.map((point) => point.checkpoint_id)).toEqual([D, C, B, A]);
    for (const order of [
      [A, B, C],
      [A, B, C, C],
      [A, B, C, '019a2b3c-4d5e-7f00-8a00-0000000000c9'],
      [A, B, C, D, A],
    ]) {
      expect(() => reorderEditPoints(edit, order)).toThrow(expect.objectContaining({ code: 'not_reorder' }));
    }
  });

  it('keeps the last point: a route needs one', () => {
    const edit = without(beginRouteEdit(base), A, B, C, D);
    expect(edit.points).toEqual([]);
    expect(() => routeEditSave(edit, newId)).toThrow(expect.objectContaining({ code: 'no_points' }));
    expect(() => removeEditPoint(edit, A)).toThrow(RouteEditError);
  });

  it('needs a route name', () => {
    expect(() => routeEditSave(setEditRouteName(beginRouteEdit(base), '  '), newId)).toThrow(
      expect.objectContaining({ code: 'route_name_required' }),
    );
  });

  it('lists the photos taken, which the save uploads', () => {
    const edit = updateEditPoint(beginRouteEdit(base), A, { name: 'Főbejárat', instruction: '', photo: { kind: 'new', photo } });
    expect(editPhotos(edit)).toEqual([photo]);
    expect(editPhotos(beginRouteEdit(base))).toEqual([]);
  });
});

describe('the save', () => {
  it('of a point taken out is a new version only, with the walk through it', () => {
    const save = routeEditSave(removeEditPoint(beginRouteEdit(base), B), newId);
    expect(save).toEqual({
      uploadPhotos: [],
      updateCheckpoints: [],
      updateRoute: null,
      createVersion: {
        id: NEW_VERSION,
        walk_duration_s: 270,
        checkpoints: [
          { checkpoint_id: A, walk_time_from_prev_s: null },
          { checkpoint_id: C, walk_time_from_prev_s: 150 },
          { checkpoint_id: D, walk_time_from_prev_s: 120 },
        ],
      },
    });
  });

  it('of a new order drops the times that no longer apply', () => {
    const save = routeEditSave(reorderEditPoints(beginRouteEdit(base), [A, C, B, D]), newId);
    expect(save.createVersion.checkpoints).toEqual([
      { checkpoint_id: A, walk_time_from_prev_s: null },
      { checkpoint_id: C, walk_time_from_prev_s: null },
      { checkpoint_id: B, walk_time_from_prev_s: null },
      { checkpoint_id: D, walk_time_from_prev_s: null },
    ]);
    expect(save.createVersion.walk_duration_s).toBe(270);
  });

  it('changes what changed of the checkpoints and the route, then makes a version of the same points', () => {
    let edit = beginRouteEdit(base);
    edit = updateEditPoint(edit, A, { name: 'Főbejárat', instruction: 'Sorompó lent?', photo: { kind: 'new', photo } });
    edit = updateEditPoint(edit, B, { name: 'Porta – hátsó ajtó', instruction: '', photo: null });
    edit = updateEditPoint(edit, C, { name: 'Raktár', instruction: 'Zárva van?', photo: null });
    edit = setEditOrderMode(setEditRouteName(edit, ' Hétvégi kör '), 'fixed');

    const save = routeEditSave(edit, newId);
    expect(save.uploadPhotos).toEqual([{ checkpoint_id: A, photo }]);
    expect(save.updateCheckpoints).toEqual([
      { id: A, body: { instruction: 'Sorompó lent?', photo_media_id: NEW_PHOTO } },
      { id: B, body: { name: 'Porta – hátsó ajtó', photo_media_id: null } },
    ]);
    expect(save.updateRoute).toEqual({ name: 'Hétvégi kör', order_mode: 'fixed' });
    // A change of the details is a new version too, with the walk as it was.
    expect(save.createVersion).toEqual({
      id: NEW_VERSION,
      walk_duration_s: 270,
      checkpoints: [
        { checkpoint_id: A, walk_time_from_prev_s: null },
        { checkpoint_id: B, walk_time_from_prev_s: 60 },
        { checkpoint_id: C, walk_time_from_prev_s: 90 },
        { checkpoint_id: D, walk_time_from_prev_s: 120 },
      ],
    });
    for (const { body } of save.updateCheckpoints) expect(schemaErrors('api/checkpoint-update.request', body)).toEqual([]);
    expect(schemaErrors('api/route-update.request', save.updateRoute)).toEqual([]);
    expect(schemaErrors('api/route-version-create.request', save.createVersion)).toEqual([]);
  });

  it('of the route alone is a new version too', () => {
    const save = routeEditSave(setEditOrderMode(beginRouteEdit(base), 'fixed'), newId);
    expect(save.updateCheckpoints).toEqual([]);
    expect(save.updateRoute).toEqual({ order_mode: 'fixed' });
    expect(save.createVersion.checkpoints).toHaveLength(4);
  });
});
