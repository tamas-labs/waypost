import type { ChainEntryDraft } from '@/chain/writer';
import type { LocationFix } from '@/chain/payloads';
import { schemaErrors } from '@/api/validation';

import { findCheckpoint, manualScan, nearestCheckpoint, reportIncident, resolveScan, type ScanContext } from './scan';
import { DomainError, type GuardState } from './state';
import { C1, C2, C3, C4, guardState, idSequence, local, OPEN_SHIFT, round, ROUTE_A, SHIFT, VERSION_A1, VERSION_A2 } from './testing';

const NOW = local('20:05');
const PHOTO = { id: '019a2b3c-4d5e-7f00-8a00-000000000030', sha256: 'b'.repeat(64) };
const NEAR_C2: LocationFix = { latitude: 47.4981, longitude: 19.0402, accuracy_m: 5, mocked: false, gnss_time: null };

function context(overrides: Partial<GuardState> = {}, location: LocationFix | null = null): ScanContext {
  return { state: guardState({ shift: OPEN_SHIFT, ...overrides }), now: NOW, location, newId: idSequence() };
}

const scanned = (checkpoint_id: string, time = '20:01') => ({ checkpoint_id, scanned_at: local(time) });
const nfc = (tag_uid: string) => ({ method: 'nfc' as const, tag_uid, ndef_raw: null });
const qr = (qr_payload: string) => ({ method: 'qr' as const, qr_payload });
const tagOf = (state: GuardState, id: string) => state.checkpoints.find((c) => c.id === id)!;

function expectValid(drafts: ChainEntryDraft[]): void {
  for (const draft of drafts) expect(schemaErrors(`chain/payload-${draft.type}`, draft.payload)).toEqual([]);
}

describe('checkpoint lookup', () => {
  it('finds an active checkpoint by NFC UID (any case and separators) or by the whole QR payload', () => {
    const { checkpoints } = guardState();
    expect(findCheckpoint(checkpoints, nfc('04:a1:b2:c3:d4:e5:02'))?.id).toBe(C2);
    expect(findCheckpoint(checkpoints, qr(checkpoints[2]!.qr_payload!))?.id).toBe(C3);
    expect(findCheckpoint(checkpoints, qr(`${checkpoints[2]!.qr_payload!}x`))).toBeNull();
    expect(findCheckpoint(checkpoints.map((c) => ({ ...c, active: false })), nfc('04A1B2C3D4E502'))).toBeNull();
  });
});

describe('scan resolution', () => {
  it('records a scan in the open round of the checkpoint’s route', () => {
    const open = round('A', '20:00');
    const outcome = resolveScan(context({ rounds: [open] }, NEAR_C2), nfc('04:a1:b2:c3:d4:e5:01'));
    expect(outcome).toEqual({
      kind: 'recorded',
      scan_id: '019a2b3c-4d5e-7f00-8a00-000000001000',
      checkpoint_id: C1,
      round_id: open.id,
      out_of_order: false,
      completed: false,
      drafts: [
        {
          type: 'scan',
          payload: {
            scan_id: '019a2b3c-4d5e-7f00-8a00-000000001000',
            round_id: open.id,
            checkpoint_id: C1,
            method: 'nfc',
            tag_uid: '04A1B2C3D4E501',
            qr_payload: null,
            ndef_raw: null,
            lat_e7: 474981000,
            lng_e7: 190402000,
            accuracy_dm: 50,
            is_mock: false,
            flags: [],
            note: null,
            media: [],
          },
          gnss_time: null,
        },
      ],
    });
    expectValid(outcome.drafts);
  });

  it('records an unknown tag with unknown_tag, without a checkpoint or a round', () => {
    const outcome = resolveScan(context({ rounds: [round('A', '20:00')] }), qr('waypost:cp:unknown'));
    expect(outcome.kind).toBe('unknown_tag');
    expect(outcome.drafts).toEqual([expect.objectContaining({ type: 'scan', payload: expect.objectContaining({ round_id: null, checkpoint_id: null, method: 'qr', qr_payload: 'waypost:cp:unknown', flags: ['unknown_tag'] }) })]);
    expectValid(outcome.drafts);
  });

  it('writes nothing for a checkpoint already scanned in its round', () => {
    const open = round('A', '20:00', { status: 'in_progress', scans: [scanned(C1, '20:03')] });
    const state = guardState({ rounds: [open] });
    expect(resolveScan(context({ rounds: [open] }), qr(tagOf(state, C1).qr_payload!))).toEqual({ kind: 'already_scanned', checkpoint_id: C1, round_id: open.id, scanned_at: local('20:03'), drafts: [] });
  });

  it('records a scan without an open round, or of a checkpoint not on its route, as out_of_round', () => {
    const state = guardState();
    for (const rounds of [[], [round('B', '20:30')], [round('A', '20:00', { status: 'completed' })]]) {
      const outcome = resolveScan(context({ rounds }), qr(tagOf(state, C1).qr_payload!));
      expect(outcome).toMatchObject({ kind: 'recorded', round_id: null, out_of_order: false, completed: false });
      expect(outcome.drafts[0]).toMatchObject({ payload: { round_id: null, checkpoint_id: C1, flags: ['out_of_round'] } });
      expectValid(outcome.drafts);
    }
  });

  it('flags out_of_order on a fixed route when it is not the first missing checkpoint, but counts it', () => {
    const state = guardState();
    const fixed = resolveScan(context({ rounds: [round('A', '20:00', { status: 'in_progress', scans: [scanned(C1)] })] }), qr(tagOf(state, C3).qr_payload!));
    expect(fixed).toMatchObject({ kind: 'recorded', out_of_order: true });
    expect(fixed.drafts[0]).toMatchObject({ payload: { flags: ['out_of_order'] } });

    const inOrder = resolveScan(context({ rounds: [round('A', '20:00', { status: 'in_progress', scans: [scanned(C1)] })] }), qr(tagOf(state, C2).qr_payload!));
    expect(inOrder).toMatchObject({ out_of_order: false });

    const free = resolveScan(context({ rounds: [round('B', '20:30')] }), qr(tagOf(state, C4).qr_payload!));
    expect(free).toMatchObject({ kind: 'recorded', out_of_order: false });
  });

  it('completes the round with its last checkpoint', () => {
    const open = round('A', '20:00', { status: 'in_progress', scans: [scanned(C1), scanned(C3)] });
    const outcome = resolveScan(context({ rounds: [open] }), nfc('04A1B2C3D4E502'));
    expect(outcome).toMatchObject({ kind: 'recorded', completed: true, out_of_order: false });
    expect(outcome.drafts[1]).toEqual({ type: 'round_closed', payload: { round_id: open.id, status: 'completed', finished_at: NOW }, gnss_time: null });
  });

  it('counts a checkpoint of two open rounds for the earlier one first, then the other', () => {
    const a = round('A', '20:00', { status: 'in_progress', scans: [scanned(C1), scanned(C2)] });
    const b = round('B', '20:30');
    const state = guardState();
    const first = resolveScan(context({ rounds: [b, a] }), nfc(tagOf(state, C3).tag_uid!));
    expect(first).toMatchObject({ round_id: a.id, completed: true });
    const second = resolveScan(context({ rounds: [{ ...a, scans: [...a.scans, scanned(C3, '20:05')] }, b] }), nfc(tagOf(state, C3).tag_uid!));
    expect(second).toMatchObject({ kind: 'recorded', round_id: b.id, completed: false });
    const third = resolveScan(context({ rounds: [{ ...a, scans: [...a.scans, scanned(C3, '20:05')] }, { ...b, scans: [scanned(C3, '20:40')] }] }), nfc(tagOf(state, C3).tag_uid!));
    expect(third).toMatchObject({ kind: 'already_scanned', round_id: a.id, scanned_at: local('20:05') });
  });

  it('counts it for a round the guard has started rather than an earlier one not started', () => {
    const b = round('B', '20:30');
    const a = round('A', '21:00', { status: 'in_progress', scans: [scanned(C1, '21:02')] });
    expect(resolveScan(context({ rounds: [b, a] }), nfc(tagOf(guardState(), C3).tag_uid!))).toMatchObject({ round_id: a.id, out_of_order: true });
  });

  it('uses the version the round was opened with, not the route’s current one', () => {
    const routes = [{ id: ROUTE_A, order_mode: 'fixed' as const, current_version_id: VERSION_A2, active: true }];
    const open = round('A', '20:00', { route_version_id: VERSION_A1 });
    const state = guardState();
    // C1 is only in A1; C4 is only in A2.
    expect(resolveScan(context({ routes, rounds: [open] }), nfc(tagOf(state, C1).tag_uid!))).toMatchObject({ round_id: open.id });
    expect(resolveScan(context({ routes, rounds: [open] }), nfc(tagOf(state, C4).tag_uid!))).toMatchObject({ round_id: null });
  });

  it('flags a mock location', () => {
    const outcome = resolveScan(context({ rounds: [round('A', '20:00')] }, { ...NEAR_C2, mocked: true, gnss_time: local('20:04') }), nfc('04A1B2C3D4E501'));
    expect(outcome.drafts[0]).toMatchObject({ payload: { is_mock: true, flags: ['mock_location'] }, gnss_time: local('20:04') });
  });
});

describe('manual entry', () => {
  const entry = (fields = {}) => ({ round_id: round('A', '20:00').id, checkpoint_id: C1, note: ' A címke letörött. ', media: [PHOTO], ...fields });

  it('records a manual scan and a damaged_tag incident with the scan’s ID, both with the note and the photos', () => {
    const outcome = manualScan(context({ rounds: [round('A', '20:00')] }, NEAR_C2), entry());
    expect(outcome).toMatchObject({ kind: 'recorded', checkpoint_id: C1, round_id: round('A', '20:00').id, completed: false });
    expect(outcome.drafts).toEqual([
      expect.objectContaining({ type: 'scan', payload: expect.objectContaining({ scan_id: '019a2b3c-4d5e-7f00-8a00-000000001000', method: 'manual', flags: ['manual'], note: 'A címke letörött.', media: [PHOTO], tag_uid: null }) }),
      {
        type: 'incident',
        payload: {
          incident_id: '019a2b3c-4d5e-7f00-8a00-000000001001',
          shift_id: SHIFT,
          category: 'damaged_tag',
          note: 'A címke letörött.',
          lat_e7: 474981000,
          lng_e7: 190402000,
          accuracy_dm: 50,
          nearest_checkpoint_id: C1,
          scan_id: '019a2b3c-4d5e-7f00-8a00-000000001000',
          media: [PHOTO],
        },
        gnss_time: null,
      },
    ]);
    expectValid(outcome.drafts);
  });

  it('keeps the order rules and completes the round', () => {
    const open = round('A', '20:00', { status: 'in_progress', scans: [scanned(C2)] });
    const outcome = manualScan(context({ rounds: [open] }), entry({ checkpoint_id: C3 }));
    expect(outcome.drafts[0]).toMatchObject({ payload: { flags: ['manual', 'out_of_order'] } });

    const last = round('A', '20:00', { status: 'in_progress', scans: [scanned(C2), scanned(C3)] });
    const completing = manualScan(context({ rounds: [last] }), entry());
    expect(completing).toMatchObject({ completed: true });
    expect(completing.drafts.map((draft) => draft.type)).toEqual(['scan', 'incident', 'round_closed']);
    expectValid(completing.drafts);
  });

  it('writes nothing for a checkpoint already scanned in the round', () => {
    const open = round('A', '20:00', { status: 'in_progress', scans: [scanned(C1)] });
    expect(manualScan(context({ rounds: [open] }), entry())).toMatchObject({ kind: 'already_scanned', drafts: [] });
  });

  it('requires a note and a photo, and an open round with the checkpoint on its route', () => {
    const ctx = context({ rounds: [round('A', '20:00')] });
    expect(() => manualScan(ctx, entry({ note: '  ' }))).toThrow(new DomainError('note_required', 'A manual entry needs a note'));
    expect(() => manualScan(ctx, entry({ media: [] }))).toThrow(new DomainError('photo_required', 'A manual entry needs a photo'));
    expect(() => manualScan(ctx, entry({ media: Array.from({ length: 6 }, () => PHOTO) }))).toThrow(expect.objectContaining({ code: 'too_many_photos' }));
    expect(() => manualScan(ctx, entry({ checkpoint_id: C4 }))).toThrow(expect.objectContaining({ code: 'checkpoint_not_on_route' }));
    expect(() => manualScan(context({ rounds: [round('A', '20:00', { status: 'missed' })] }), entry())).toThrow(expect.objectContaining({ code: 'unknown_round' }));
    expect(() => manualScan(context({ shift: null, rounds: [round('A', '20:00')] }), entry())).toThrow(expect.objectContaining({ code: 'no_shift' }));
  });
});

describe('incident', () => {
  it('records an incident of the shift with the nearest checkpoint', () => {
    const draft = reportIncident(context({}, NEAR_C2), { category: 'open_door', note: ' A raktárajtó nyitva. ', media: [PHOTO] });
    expect(draft).toEqual({
      type: 'incident',
      payload: {
        incident_id: '019a2b3c-4d5e-7f00-8a00-000000001000',
        shift_id: SHIFT,
        category: 'open_door',
        note: 'A raktárajtó nyitva.',
        lat_e7: 474981000,
        lng_e7: 190402000,
        accuracy_dm: 50,
        nearest_checkpoint_id: C2,
        scan_id: null,
        media: [PHOTO],
      },
      gnss_time: null,
    });
    expectValid([draft]);
  });

  it('needs no note or photo, at most 5 photos, and an open shift', () => {
    const draft = reportIncident(context(), { category: 'other' });
    expect(draft.payload).toMatchObject({ note: null, media: [], lat_e7: null, nearest_checkpoint_id: null });
    expect(() => reportIncident(context(), { category: 'water', media: Array.from({ length: 6 }, () => PHOTO) })).toThrow(expect.objectContaining({ code: 'too_many_photos' }));
    expect(() => reportIncident(context({ shift: null }), { category: 'water' })).toThrow(expect.objectContaining({ code: 'no_shift' }));
  });

  it('keeps the point the guard reported it at, wherever the location is', () => {
    expect(reportIncident(context({}, NEAR_C2), { category: 'water', checkpoint_id: C4 }).payload.nearest_checkpoint_id).toBe(C4);
    expect(reportIncident(context(), { category: 'water', checkpoint_id: C4 }).payload.nearest_checkpoint_id).toBe(C4);
  });

  it('finds the nearest active checkpoint with a location', () => {
    const { checkpoints } = guardState();
    expect(nearestCheckpoint(checkpoints, { ...NEAR_C2, latitude: 47.4984 })).toBe(C4);
    expect(nearestCheckpoint(checkpoints.map((c) => (c.id === C4 ? { ...c, active: false } : c)), { ...NEAR_C2, latitude: 47.4984 })).toBe(C3);
    expect(nearestCheckpoint(checkpoints.map((c) => ({ ...c, lat_e7: null, lng_e7: null })), NEAR_C2)).toBeNull();
    expect(nearestCheckpoint(checkpoints, null)).toBeNull();
  });
});
