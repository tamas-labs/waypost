import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { manualScan, resolveScan, type TagRead } from '@/domain/scan';
import { guardLogin } from '@/domain/shift';
import { C1, C2, C3, guardState, GUARD, idSequence, local, TIMEZONE } from '@/domain/testing';
import type { TagReading } from '@/nfc/tag';
import type { ClockReading } from '@/time/clock';

import { forgetShownRounds, loadRoundScreenInfo, markRoundShown, roundMapOf, wasRoundShown, type RoundPoint } from './round';
import { recordTagRead, scanFeedback, tagReadOf } from './scan';
import { loadGuardState } from './state';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn(() => Promise.resolve({ latitude: 47.5, longitude: 19, accuracy_m: 8, mocked: false, gnss_time: null })) }));

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });
const newId = idSequence();
const write = (drafts: Parameters<typeof appendChainEntries>[1], photos?: Parameters<typeof appendChainEntries>[2]) => appendChainEntries(db, drafts, { readClock, ...photos });
const state = () => loadGuardState(db, now)!;
const nfc = (id: string): TagRead => ({ method: 'nfc', tag_uid: state().checkpoints.find((c) => c.id === id)!.tag_uid!, ndef_raw: null });
const scanAt = async (time: string, id: string) => {
  now = local(time);
  await write(resolveScan({ state: state(), now, location: null, newId }, nfc(id)).drafts);
};

async function openRound(): Promise<string> {
  now = local('19:55');
  await write(guardLogin(state(), GUARD, now, newId).drafts);
  now = local('20:00');
  await write(schedulerStep(state(), now, newId));
  return state().rounds[0]!.id;
}

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  await seedSite(db);
  forgetShownRounds();
});

describe('the round on its screen', () => {
  it('lists the points in position order before any scan', async () => {
    const id = await openRound();
    expect(loadRoundScreenInfo(db, id, readClock)).toEqual({
      timezone: TIMEZONE,
      scheduled_at: local('20:00'),
      deadline: local('20:20'),
      route_name: 'Útvonal 61',
      fixed_order: true,
      scanned: 0,
      points: [
        { checkpoint_id: C1, name: 'Pont 1', position: 1, location: { latitude: 47.4980, longitude: 19.0402 }, scan: null },
        { checkpoint_id: C2, name: 'Pont 2', position: 2, location: { latitude: 47.4981, longitude: 19.0402 }, scan: null },
        { checkpoint_id: C3, name: 'Pont 3', position: 3, location: { latitude: 47.4982, longitude: 19.0402 }, scan: null },
      ],
    });
  });

  it('puts the scanned points first, in time order, with how they were scanned', async () => {
    const id = await openRound();
    await scanAt('20:03', C2);
    const photo = { id: newId(), sha256: 'b'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: 'file:///documents/media/c.jpg', taken_at: local('20:04') };
    now = local('20:04');
    await write(manualScan({ state: state(), now, location: null, newId }, { round_id: id, checkpoint_id: C1, note: 'Letörött.', media: [photo] }).drafts, { photos: [photo] });

    const info = loadRoundScreenInfo(db, id, readClock)!;
    expect(info.scanned).toBe(2);
    expect(info.points.map((point) => [point.checkpoint_id, point.scan])).toEqual([
      [C2, { scanned_at: local('20:03'), method: 'nfc', manual: false, out_of_order: true, location: null, accuracy_m: null }],
      [C1, { scanned_at: local('20:04'), method: 'manual', manual: true, out_of_order: false, location: null, accuracy_m: null }],
      [C3, null],
    ]);
  });

  it('is null for a round that closed, or that is not known', async () => {
    const id = await openRound();
    now = local('20:20');
    await write(schedulerStep(state(), now, newId));
    expect(loadRoundScreenInfo(db, id, readClock)).toBeNull();
    expect(loadRoundScreenInfo(db, 'unknown', readClock)).toBeNull();
  });

  it('does not name the only route', async () => {
    ({ db } = await createTestDatabase());
    const site = guardState();
    await seedSite(db, { ...site, routes: site.routes.slice(0, 1), schedules: site.schedules.slice(0, 1), versions: site.versions.slice(0, 1) });
    const id = await openRound();
    expect(loadRoundScreenInfo(db, id, readClock)?.route_name).toBeNull();
  });

  it('remembers the rounds shown until forgotten', () => {
    markRoundShown('a');
    expect(wasRoundShown('a')).toBe(true);
    expect(wasRoundShown('b')).toBe(false);
    forgetShownRounds();
    expect(wasRoundShown('a')).toBe(false);
  });
});

describe('recording a read', () => {
  it('writes the scan with its location', async () => {
    const id = await openRound();
    const outcome = await recordTagRead(db, nfc(C1), readClock);
    expect(outcome).toMatchObject({ kind: 'recorded', checkpoint_id: C1, round_id: id, out_of_order: false, completed: false });
    expect(state().rounds[0]!.status).toBe('in_progress');
    expect(outcome.drafts[0]).toMatchObject({ type: 'scan', payload: { lat_e7: 475000000, lng_e7: 190000000 } });
    expect(scanFeedback(outcome)).toBe('success');
  });

  it('feels different for a wrong order, a repeat and an unknown tag', async () => {
    await openRound();
    expect(scanFeedback(await recordTagRead(db, nfc(C2), readClock))).toBe('warning');
    expect(scanFeedback(await recordTagRead(db, nfc(C2), readClock))).toBe('warning');
    expect(scanFeedback(await recordTagRead(db, { method: 'nfc', tag_uid: 'FFFFFFFF', ndef_raw: null }, readClock))).toBe('error');
    now = local('20:20');
    await write(schedulerStep(state(), now, newId));
    expect(scanFeedback(await recordTagRead(db, nfc(C1), readClock))).toBe('warning');
  });

  it('fails while the site is not pulled', async () => {
    ({ db } = await createTestDatabase());
    await expect(recordTagRead(db, { method: 'qr', qr_payload: 'x' }, readClock)).rejects.toThrow('not pulled');
  });

  it('takes the UID of a tag, and nothing from a tag without a valid one', () => {
    const tag = { uid: '04A1B2C3', ndefRaw: 'AA==' } as TagReading;
    expect(tagReadOf(tag)).toEqual({ method: 'nfc', tag_uid: '04A1B2C3', ndef_raw: 'AA==' });
    expect(tagReadOf({ ...tag, uid: null })).toBeNull();
  });
});

describe('the round on its map', () => {
  const trained = { latitude: 47.1, longitude: 19.1 };
  const gps = { latitude: 47.2, longitude: 19.2 };
  const point = (position: number, location: RoundPoint['location'], scan: Partial<NonNullable<RoundPoint['scan']>> | null = null): RoundPoint => ({
    checkpoint_id: `c${position}`,
    name: `Pont ${position}`,
    position,
    location,
    scan: scan === null ? null : { scanned_at: local('20:03'), method: 'nfc', manual: false, out_of_order: false, location: null, accuracy_m: null, ...scan },
  });

  it('puts a scanned point where it was scanned, and a point left where it was trained', () => {
    const { points } = roundMapOf([point(2, trained, { location: gps, accuracy_m: 8 }), point(1, trained)]);
    expect(points).toEqual([
      { checkpoint_id: 'c2', name: 'Pont 2', position: 2, state: 'scanned', coordinate: gps, accuracy_m: null },
      { checkpoint_id: 'c1', name: 'Pont 1', position: 1, state: 'pending', coordinate: trained, accuracy_m: null },
    ]);
  });

  it('falls back to the trained place for a scan without a location, and leaves a point with neither off the map', () => {
    const { points } = roundMapOf([point(1, trained, {}), point(2, null, {}), point(3, null)]);
    expect(points.map((p) => [p.position, p.coordinate])).toEqual([[1, trained]]);
  });

  it('keeps the accuracy of a manual point only', () => {
    const { points } = roundMapOf([point(1, null, { manual: true, method: 'manual', location: gps, accuracy_m: 12.5 }), point(2, null, { manual: true, method: 'manual', location: gps })]);
    expect(points.map((p) => [p.state, p.accuracy_m])).toEqual([
      ['manual', 12.5],
      ['manual', null],
    ]);
  });

  it('connects the located scans in time order, with their times', () => {
    const second = { latitude: 47.3, longitude: 19.3 };
    const map = roundMapOf([point(2, trained, { scanned_at: local('20:03'), location: gps }), point(3, trained, { scanned_at: local('20:05') }), point(1, trained, { scanned_at: local('20:09'), location: second }), point(4, trained)]);
    expect(map.walked).toEqual([gps, second]);
    expect(map.walked_between).toEqual({ from: local('20:03'), to: local('20:09') });
  });

  it('has no way walked before a located scan', () => {
    expect(roundMapOf([point(1, trained, {}), point(2, trained)])).toMatchObject({ walked: [], walked_between: null });
  });

  it('reads the locations from the database', async () => {
    const id = await openRound();
    now = local('20:03');
    await write(resolveScan({ state: state(), now, location: { latitude: 47.5, longitude: 19, accuracy_m: 8, mocked: false, gnss_time: null }, newId }, nfc(C1)).drafts);
    const info = loadRoundScreenInfo(db, id, readClock)!;
    expect(info.points[0]!.scan).toMatchObject({ location: { latitude: 47.5, longitude: 19 }, accuracy_m: 8 });
  });
});
