import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useIsFocused } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ShiftCloseScreen from '@/app/(guard)/shift/close';
import { pinHash } from '@/auth/pin';
import { useSession } from '@/auth/session';
import * as writer from '@/chain/writer';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { shifts, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { manualScan, reportIncident, resolveScan } from '@/domain/scan';
import { closeShiftByGuard, guardLogin } from '@/domain/shift';
import { C1, C2, C3, GUARD, idSequence, local, OTHER_GUARD, SITE } from '@/domain/testing';
import { playFeedback } from '@/feedback/feedback';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { requestSync } from '@/sync/runtime';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useIsFocused: jest.fn(() => true),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const AT = '2026-10-27T12:00:00.000Z';
const SALT = Buffer.alloc(16, 7).toString('base64');
/** Few iterations: the screen's logic is under test here, PBKDF2 in src/auth/pin.test.ts. */
const ITERATIONS = 10;
const PIN = '246810';
const OTHER_PIN = '135790';
const PHOTO = { id: '019a2b3c-4d5e-7f00-8a00-000000009200', sha256: 'c'.repeat(64), mime: 'image/jpeg', size_bytes: 240_000, local_uri: 'file:///documents/media/9200.jpg', taken_at: AT };

let db: Database;
const newId = idSequence();

const state = () => loadGuardState(db, nowTimestamp())!;
const write = (drafts: Parameters<typeof appendChainEntries>[1], photos?: Parameters<typeof appendChainEntries>[2]) => appendChainEntries(db, drafts, photos);
const step = () => write(schedulerStep(state(), nowTimestamp(), newId));
const context = () => ({ state: state(), now: nowTimestamp(), location: null, newId });
const tag = (id: string) => ({ method: 'nfc' as const, tag_uid: state().checkpoints.find((c) => c.id === id)!.tag_uid!, ndef_raw: null });
const scanTag = (id: string) => write(resolveScan(context(), tag(id)).drafts);
const openShift = () => db.select().from(shifts).all().find((shift) => shift.ended_at === null);

const tree = () => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>
      <ShiftCloseScreen />
    </ThemeProvider>
  </SafeAreaProvider>
);
const renderScreen = () => render(tree());
const press = (name: string | RegExp) => act(async () => fireEvent.press(screen.getByRole('button', { name })));
const enter = async (pin: string) => {
  for (const digit of pin) await press(digit);
};
const confirm = async (pin: string) => {
  await press('Zárás PIN-kóddal');
  await enter(pin);
  await press('Műszak zárása');
};

async function addUser(id: string, name: string, pin: string) {
  const pin_hash = await pinHash(pin, SALT, ITERATIONS);
  db.insert(users).values({ id, name, role: 'guard', pin_hash, pin_salt: SALT, pin_iterations: ITERATIONS, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: id }).run();
}

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  await addUser(GUARD, 'Kovács Péter', PIN);
  await addUser(OTHER_GUARD, 'Nagy Anna', OTHER_PIN);
  await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: null });
  useSyncStatus.setState({ pendingCount: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the summary', () => {
  it('names the guard and the time of the shift', async () => {
    jest.setSystemTime(Date.parse(local('20:10')));
    await renderScreen();
    expect(screen.getByRole('header', { name: 'Műszakzárás' })).toBeOnTheScreen();
    expect(screen.getByText('Kovács Péter · 19:55 – 20:10')).toBeOnTheScreen();
  });

  it('counts the rounds, the incidents and the unverified points of the shift', async () => {
    jest.setSystemTime(Date.parse(local('20:00')));
    await step();
    await scanTag(C1);
    await write(manualScan(context(), { round_id: state().rounds[0]!.id, checkpoint_id: C2, note: 'Letörött.', media: [PHOTO] }).drafts, { photos: [PHOTO] });
    await scanTag(C3);
    await write([reportIncident(context(), { category: 'water' })]);
    jest.setSystemTime(Date.parse(local('21:00')));
    await step();
    jest.setSystemTime(Date.parse(local('21:21')));
    await step();

    await renderScreen();
    expect(screen.getByLabelText('1 teljesítve')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 hiányos')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 elmaradt')).toBeOnTheScreen();
    expect(screen.getByLabelText('Események: 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nem igazolt pont: 1')).toBeOnTheScreen();
    expect(screen.getAllByRole('image', { name: /Körök idővonala/ })).toHaveLength(2);
  });

  it('does not count what belongs to an earlier shift', async () => {
    await write([reportIncident(context(), { category: 'water' })]);
    await write(closeShiftByGuard(state(), nowTimestamp()));
    await write(guardLogin(state(), GUARD, nowTimestamp(), newId).drafts);
    await renderScreen();
    expect(screen.getByLabelText('Események: 0')).toBeOnTheScreen();
  });

  it('tells what waits for upload', async () => {
    useSyncStatus.setState({ pendingCount: 3 });
    await renderScreen();
    expect(screen.getByText(/3 tétel vár feltöltésre\./)).toBeOnTheScreen();
    await act(async () => useSyncStatus.setState({ pendingCount: 0 }));
    expect(screen.queryByText(/vár feltöltésre\./)).not.toBeOnTheScreen();
  });

  it('warns about a round still open, and how it would close', async () => {
    jest.setSystemTime(Date.parse(local('20:00')));
    await step();
    await scanTag(C1);
    await renderScreen();
    expect(screen.getByText(/20:00-s kör még nyitva van\./)).toBeOnTheScreen();
    expect(screen.getByText(/1 \/ 3 pont kész\. A zárással ez a kör is lezárul, állapota: Hiányos\./)).toBeOnTheScreen();
  });

  it('has no warning without an open round', async () => {
    await renderScreen();
    expect(screen.queryByText(/még nyitva van/)).not.toBeOnTheScreen();
  });

  it('follows a round closing meanwhile', async () => {
    jest.setSystemTime(Date.parse(local('20:00')));
    await step();
    await renderScreen();
    expect(screen.getByText(/állapota: Elmaradt/)).toBeOnTheScreen();
    jest.setSystemTime(Date.parse(local('20:21')));
    await act(async () => void (await step()));
    expect(screen.queryByText(/még nyitva van/)).not.toBeOnTheScreen();
  });

  it('shows only the header once the shift has closed by itself', async () => {
    await write(closeShiftByGuard(state(), nowTimestamp()));
    await renderScreen();
    expect(screen.getByRole('header', { name: 'Műszakzárás' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Zárás PIN-kóddal' })).not.toBeOnTheScreen();
  });
});

describe('closing with the PIN', () => {
  it('closes nothing before the PIN', async () => {
    await renderScreen();
    await press('Zárás PIN-kóddal');
    expect(screen.getByRole('header', { name: 'Add meg a PIN-kódodat' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Műszak zárása' })).toBeDisabled();
    expect(openShift()).toBeDefined();
  });

  it('can be cancelled', async () => {
    await renderScreen();
    await press('Zárás PIN-kóddal');
    await press('Mégse');
    expect(screen.queryByRole('button', { name: 'Műszak zárása' })).not.toBeOnTheScreen();
    expect(openShift()).toBeDefined();
  });

  it('closes the shift, logs the guard out and syncs', async () => {
    await renderScreen();
    await confirm(PIN);
    expect(db.select().from(shifts).get()).toMatchObject({ closed_by: 'guard' });
    expect(openShift()).toBeUndefined();
    expect(useSession.getState().activeUser).toBeNull();
    expect(requestSync).toHaveBeenCalledWith('shift_closed');
    expect(playFeedback).toHaveBeenCalledWith('success');
  });

  it('closes an open round with the shift', async () => {
    jest.setSystemTime(Date.parse(local('20:00')));
    await step();
    await scanTag(C1);
    const roundId = state().rounds[0]!.id;
    await renderScreen();
    await confirm(PIN);
    expect(openShift()).toBeUndefined();
    const closed = db.select().from(shifts).get();
    expect(closed?.closed_by).toBe('guard');
    expect(loadGuardState(db, nowTimestamp())!.rounds.find((round) => round.id === roundId)?.status).toBe('incomplete');
  });

  it('stays on a wrong PIN, and tells so', async () => {
    await renderScreen();
    await confirm('111111');
    expect(openShift()).toBeDefined();
    expect(useSession.getState().activeUser).toEqual({ id: GUARD, role: 'guard' });
    expect(screen.getByText('Hibás PIN-kód')).toBeOnTheScreen();
    expect(playFeedback).toHaveBeenCalledWith('error');
    expect(screen.getByRole('button', { name: 'Műszak zárása' })).toBeDisabled();
  });

  it('does not take another guard’s PIN', async () => {
    await renderScreen();
    await confirm(OTHER_PIN);
    expect(openShift()).toBeDefined();
    expect(useSession.getState().activeUser).toEqual({ id: GUARD, role: 'guard' });
    expect(screen.getByText('Hibás PIN-kód')).toBeOnTheScreen();
  });

  it('counts down the lock after too many wrong PINs, and then the keypad is off', async () => {
    setKv(db, 'pin.lockout', { failures: 4, lock: null });
    await renderScreen();
    await confirm('111111');
    expect(screen.getByText(/Túl sok hibás PIN-kód\. Újra próbálhatod \d+:\d\d múlva\./)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
  });

  it('keeps the shift, and tells so, when the entries cannot be written', async () => {
    await renderScreen();
    jest.spyOn(writer, 'appendDecidedEntries').mockRejectedValueOnce(new Error('no database'));
    await confirm(PIN);
    expect(screen.getByText('A zárás nem sikerült. Próbáld újra.')).toBeOnTheScreen();
    expect(openShift()).toBeDefined();
    expect(useSession.getState().activeUser).toEqual({ id: GUARD, role: 'guard' });
    expect(requestSync).not.toHaveBeenCalled();
  });

  it('gives way to a screen pushed over it', async () => {
    await renderScreen();
    await press('Zárás PIN-kóddal');
    jest.mocked(useIsFocused).mockReturnValue(false);
    await act(async () => screen.rerender(tree()));
    expect(screen.queryByRole('button', { name: 'Műszak zárása' })).not.toBeOnTheScreen();
    jest.mocked(useIsFocused).mockReturnValue(true);
    await act(async () => screen.rerender(tree()));
    expect(screen.getByRole('button', { name: 'Műszak zárása' })).toBeOnTheScreen();
  });
});
