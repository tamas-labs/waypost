// The domain's output written by the chain writer: the entries fit the projections, and the projections read back
// give the state of the next step.
import { chainVectors } from '@waypost/schema/vectors';
import { asc, isNotNull, isNull } from 'drizzle-orm';

import { appendChainEntries } from '@/chain/writer';
import { setDeviceCredentials } from '@/auth/credentials';
import type { Database } from '@/db/database';
import { setKv } from '@/db/kv';
import { chainEntries, incidents, rounds, scans, shifts } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import type { ClockReading } from '@/time/clock';

import { schedulerStep } from './rounds';
import { manualScan, resolveScan } from './scan';
import { guardLogin } from './shift';
import type { GuardState, RoundInfo } from './state';
import { C1, C2, C3, GUARD, guardState, idSequence, local, OTHER_GUARD, ROUTE_A, ROUTE_B, VERSION_A1 } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn() }));

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });
const newId = idSequence();
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts, { readClock });

/** The domain state from the projections (what the runner of M3-23 will do). */
function loadState(): GuardState {
  const shift = db.select().from(shifts).where(isNull(shifts.ended_at)).get() ?? null;
  const roundRows = db.select().from(rounds).orderBy(asc(rounds.scheduled_at)).all();
  const scanRows = db.select().from(scans).where(isNotNull(scans.checkpoint_id)).all();
  const roundInfos: RoundInfo[] = roundRows.map((row) => ({
    ...row,
    route_id: row.route_version_id === VERSION_A1 ? ROUTE_A : ROUTE_B,
    scans: scanRows.filter((s) => s.round_id === row.id).map((s) => ({ checkpoint_id: s.checkpoint_id!, scanned_at: s.scanned_at })),
  }));
  return guardState({ shift: shift === null ? null : { id: shift.id, guard_id: shift.guard_id, started_at: shift.started_at }, rounds: roundInfos });
}

const roundStatuses = () => db.select({ scheduled_at: rounds.scheduled_at, status: rounds.status }).from(rounds).orderBy(asc(rounds.scheduled_at)).all();

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  setKv(db, 'device.id', '019a2b3c-4d5e-7f00-8a00-000000000004');
  await setDeviceCredentials({ token: 'device-token', secret: chainVectors.key_base64 });
});

describe('a night on the site phone', () => {
  it('goes from login through rounds, scans and a manual entry to the handover', async () => {
    now = local('19:55');
    const login = guardLogin(loadState(), GUARD, now, newId);
    expect(login.outcome).toBe('started');
    await write(login.drafts);

    // The app did not run until 21:10: 20:00 missed, B 20:30 and A 21:00 open.
    now = local('21:10');
    await write(schedulerStep(loadState(), now, newId));
    expect(roundStatuses()).toEqual([
      { scheduled_at: local('20:00'), status: 'missed' },
      { scheduled_at: local('20:30'), status: 'open' },
      { scheduled_at: local('21:00'), status: 'open' },
    ]);

    const tag = (id: string) => loadState().checkpoints.find((c) => c.id === id)!.tag_uid!;
    const context = () => ({ state: loadState(), now, location: null, newId });
    await write(resolveScan(context(), { method: 'nfc', tag_uid: tag(C1), ndef_raw: null }).drafts);
    const roundA = loadState().rounds.find((r) => r.scheduled_at === local('21:00'))!;
    await write(manualScan(context(), { round_id: roundA.id, checkpoint_id: C2, note: 'Letörött.', media: [{ id: newId(), sha256: 'b'.repeat(64) }] }).drafts);
    // C3 is on both routes: it completes A first.
    const completing = resolveScan(context(), { method: 'nfc', tag_uid: tag(C3), ndef_raw: null });
    expect(completing).toMatchObject({ round_id: roundA.id, completed: true });
    await write(completing.drafts);
    await write(resolveScan(context(), { method: 'nfc', tag_uid: tag(C3), ndef_raw: null }).drafts);
    expect(roundStatuses().map((r) => r.status)).toEqual(['missed', 'in_progress', 'completed']);
    expect(db.select().from(incidents).all()).toEqual([expect.objectContaining({ category: 'damaged_tag', note: 'Letörött.' })]);

    now = local('21:15');
    const handover = guardLogin(loadState(), OTHER_GUARD, now, newId);
    await write(handover.drafts);
    expect(roundStatuses().map((r) => r.status)).toEqual(['missed', 'incomplete', 'completed']);
    expect(db.select({ guard_id: shifts.guard_id, closed_by: shifts.closed_by }).from(shifts).orderBy(asc(shifts.started_at)).all()).toEqual([
      { guard_id: GUARD, closed_by: 'handover' },
      { guard_id: OTHER_GUARD, closed_by: null },
    ]);

    // The new shift does not reopen the times of the previous one.
    now = local('21:20');
    expect(schedulerStep(loadState(), now, newId)).toEqual([]);
    // shift_started; 4 scheduler entries; scan; manual scan + incident; scan + round_closed; scan; handover 3.
    expect(db.select().from(chainEntries).all().map((entry) => entry.seq)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });
});
