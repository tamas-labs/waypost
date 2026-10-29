import type { Database } from '@/db/database';
import { deleteKv } from '@/db/kv';
import { devices, rounds, scans, shifts, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { C1, C2, C4, GUARD, guardState, local, OPEN_SHIFT, round, SHIFT, SITE, VERSION_A2 } from '@/domain/testing';
import type { RoundInfo } from '@/domain/state';

import { loadGuardState } from './state';
import { DEVICE, seedSite } from './testing';

let db: Database;
const NOW = local('21:10');
const OTHER_SITE = '019a2b3c-4d5e-7f00-8a00-000000000012';

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  await seedSite(db);
});

function addShift(id: string, started_at: string, fields: Partial<typeof shifts.$inferInsert> = {}) {
  db.insert(shifts).values({ id, site_id: SITE, device_id: DEVICE, guard_id: GUARD, started_at, chain_entry_id: `entry-${id}`, ...fields }).run();
}

/** The projection rows of a round of the fixture, with its scans. */
function addRound(info: RoundInfo) {
  const { route_id: _route, scans: roundScans, ...row } = info;
  db.insert(rounds).values(row).run();
  for (const [n, scan] of roundScans.entries()) {
    db.insert(scans)
      .values({ id: `${info.id}-${n}`, round_id: info.id, checkpoint_id: scan.checkpoint_id, method: 'nfc', scanned_at: scan.scanned_at, lat_e7: null, lng_e7: null, accuracy_dm: null, is_mock: false, flags: [], note: null, chain_entry_id: `entry-${info.id}-${n}` })
      .run();
  }
}

describe('guard state from the database', () => {
  it('is the configuration of the phone’s site, with the current route versions', () => {
    const expected = guardState();
    expect(loadGuardState(db, NOW)).toEqual({ ...expected, versions: expected.versions.filter((version) => version.id !== VERSION_A2) });
  });

  it('is null while the phone is not enrolled, not assigned to a site, or its site is not pulled yet', () => {
    db.delete(sites).run();
    expect(loadGuardState(db, NOW)).toBeNull();
    db.update(devices).set({ site_id: null }).run();
    expect(loadGuardState(db, NOW)).toBeNull();
    deleteKv(db, 'device.id');
    expect(loadGuardState(db, NOW)).toBeNull();
  });

  it('has the open shift of this phone and the rounds with their scans and versions', () => {
    addShift(SHIFT, OPEN_SHIFT.started_at);
    const missed = round('A', '20:00', { status: 'missed' });
    const started = round('A', '21:00', { route_version_id: VERSION_A2, status: 'in_progress', scans: [{ checkpoint_id: C2, scanned_at: local('21:04') }, { checkpoint_id: C4, scanned_at: local('21:06') }] });
    const open = round('B', '20:30');
    [missed, started, open].forEach(addRound);
    // An unknown tag of the round is not one of its scans.
    db.insert(scans).values({ id: 'unknown', round_id: started.id, checkpoint_id: null, method: 'nfc', scanned_at: local('21:05'), is_mock: false, flags: ['unknown_tag'], chain_entry_id: 'entry-unknown' }).run();

    const state = loadGuardState(db, NOW)!;
    expect(state.shift).toEqual(OPEN_SHIFT);
    expect(state.rounds).toEqual([missed, open, started]);
    expect(state.versions.map((version) => version.id)).toEqual(guardState().versions.map((version) => version.id));
    expect(state.versions.find((version) => version.id === VERSION_A2)?.checkpoint_ids).toEqual([C2, C4]);
  });

  it('has no shift once it is closed, but keeps its rounds of the last two days', () => {
    addShift(SHIFT, OPEN_SHIFT.started_at, { ended_at: local('23:00'), closed_by: 'guard' });
    const closed = round('A', '20:00', { status: 'completed', scans: [{ checkpoint_id: C1, scanned_at: local('20:05') }] });
    addRound(closed);
    expect(loadGuardState(db, local('19:00', '2026-11-05'))).toMatchObject({ shift: null, rounds: [closed] });
    expect(loadGuardState(db, local('21:00', '2026-11-06'))?.rounds).toEqual([]);
  });

  it('keeps the rounds from two days before an older shift start, and the open ones whatever their age', () => {
    addShift(SHIFT, local('19:55', '2026-11-02'));
    const old = round('A', '20:00', { scheduled_at: local('19:00', '2026-10-31'), status: 'missed' });
    const kept = round('A', '21:00', { scheduled_at: local('21:00', '2026-10-31'), status: 'missed' });
    const open = round('B', '20:30', { scheduled_at: local('20:30', '2026-10-20') });
    [old, kept, open].forEach(addRound);
    expect(loadGuardState(db, NOW)?.rounds.map((r) => r.id)).toEqual([open.id, kept.id]);
  });

  it('leaves out the shifts and rounds of another site', () => {
    addShift('other-shift', OPEN_SHIFT.started_at, { site_id: OTHER_SITE });
    addRound(round('A', '20:00', { shift_id: 'other-shift' }));
    expect(loadGuardState(db, NOW)).toMatchObject({ shift: null, rounds: [] });
  });
});
