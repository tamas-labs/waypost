// The domain's output written by the chain writer: the entries fit the projections, and the projections loaded
// back (loadGuardState) give the state of the next step.
import { asc } from 'drizzle-orm';

import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { chainEntries, incidents, media, rounds, scans, shifts } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { manualScan, resolveScan } from '@/domain/scan';
import { guardLogin } from '@/domain/shift';
import type { GuardState } from '@/domain/state';
import { C1, C2, C3, GUARD, idSequence, local, OTHER_GUARD } from '@/domain/testing';
import type { ClockReading } from '@/time/clock';

import { loadGuardState } from './state';
import { seedSite } from './testing';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn() }));

let db: Database;
let now: string;
const readClock = (): ClockReading => ({ device_time: now, uptime_ms: 1000, boot_id: 'android-boot:12' });
const newId = idSequence();
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts, { readClock });

const loadState = (): GuardState => loadGuardState(db, now)!;

const roundStatuses = () => db.select({ scheduled_at: rounds.scheduled_at, status: rounds.status }).from(rounds).orderBy(asc(rounds.scheduled_at)).all();

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  await seedSite(db);
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
    const photo = { id: newId(), sha256: 'b'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: 'file:///documents/media/c2.jpg', taken_at: now };
    await appendChainEntries(db, manualScan(context(), { round_id: roundA.id, checkpoint_id: C2, note: 'Letörött.', media: [photo] }).drafts, { readClock, photos: [photo] });
    // C3 is on both routes: it completes A first.
    const completing = resolveScan(context(), { method: 'nfc', tag_uid: tag(C3), ndef_raw: null });
    expect(completing).toMatchObject({ round_id: roundA.id, completed: true });
    await write(completing.drafts);
    await write(resolveScan(context(), { method: 'nfc', tag_uid: tag(C3), ndef_raw: null }).drafts);
    expect(roundStatuses().map((r) => r.status)).toEqual(['missed', 'in_progress', 'completed']);
    expect(db.select().from(incidents).all()).toEqual([expect.objectContaining({ category: 'damaged_tag', note: 'Letörött.' })]);
    const manual = db.select().from(scans).all().find((row) => row.method === 'manual')!;
    expect(db.select({ owner_type: media.owner_type, owner_id: media.owner_id, uploaded_at: media.uploaded_at }).from(media).all()).toEqual([{ owner_type: 'scan', owner_id: manual.id, uploaded_at: null }]);

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
