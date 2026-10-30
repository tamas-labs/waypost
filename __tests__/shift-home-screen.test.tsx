import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from '@/app/(guard)/home';
import { useSession } from '@/auth/session';
import { shiftClosed } from '@/chain/payloads';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { resolveScan } from '@/domain/scan';
import { guardLogin } from '@/domain/shift';
import { C1, GUARD, idSequence, local, SITE } from '@/domain/testing';
import { requestSchedulerStep } from '@/guard/scheduler';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const AT = '2026-10-27T12:00:00.000Z';

let db: Database;
const newId = idSequence();

const setNow = (at: string) => jest.setSystemTime(Date.parse(at));
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const step = () => write(schedulerStep(loadGuardState(db, nowTimestamp())!, nowTimestamp(), newId));

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.mocked(requestSchedulerStep).mockClear();
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  db.insert(users).values({ id: GUARD, name: 'Nagy Péter', role: 'guard', pin_hash: null, pin_salt: null, pin_iterations: null, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: GUARD }).run();
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: null });
  await write(guardLogin(loadGuardState(db, nowTimestamp())!, GUARD, nowTimestamp(), newId).drafts);
});

afterEach(() => jest.useRealTimers());

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

it('shows the site, the guard and the next round, counting down', async () => {
  setNow(local('19:52'));
  await renderScreen();
  expect(screen.getByText('Raktár')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Nagy Péter · műszakban' })).toBeOnTheScreen();
  expect(screen.getByText('Következő kör: 20:00')).toBeOnTheScreen();
  expect(screen.getByText('08:00')).toBeOnTheScreen();
  expect(screen.getByText('múlva indul · ébresztő szól')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(2000));
  expect(screen.getByText('07:58')).toBeOnTheScreen();
  expect(requestSchedulerStep).not.toHaveBeenCalled();
});

it('counts in hours and minutes above an hour', async () => {
  setNow(local('18:29'));
  await renderScreen();
  expect(screen.getByText('1:31')).toBeOnTheScreen();
});

it('asks the scheduler for the round when the countdown runs out, and shows the round once it opened', async () => {
  setNow(local('19:59'));
  await renderScreen();
  await act(async () => jest.advanceTimersByTime(60_000));
  expect(screen.getByText('00:00')).toBeOnTheScreen();
  expect(requestSchedulerStep).toHaveBeenCalledTimes(1);

  await act(async () => void (await step()));
  expect(screen.getByText('20:00-s kör')).toBeOnTheScreen();
  // The time left until the 20:20 deadline.
  expect(screen.getByText('20:00', { exact: true })).toBeOnTheScreen();
  expect(screen.getByText('van hátra · határidő 20:20')).toBeOnTheScreen();
  expect(screen.getByLabelText(/20:00 Folyamatban/)).toBeOnTheScreen();
});

it('lists the closed rounds, newest on top, under the timelines of the routes', async () => {
  setNow(local('20:25'));
  await step();
  setNow(local('21:02'));
  await step();
  const tag = loadGuardState(db, nowTimestamp())!.checkpoints.find((checkpoint) => checkpoint.id === C1)!.tag_uid!;
  await write(resolveScan({ state: loadGuardState(db, nowTimestamp())!, now: nowTimestamp(), location: null, newId }, { method: 'nfc', tag_uid: tag, ndef_raw: null }).drafts);
  setNow(local('21:25'));
  await step();

  await renderScreen();
  expect(screen.getByText('2 / 6 kör lezárva')).toBeOnTheScreen();
  // B's 20:30 is still running: its deadline is the next round of the route.
  const rows = screen.getAllByText(/ · (Hiányos|Elmaradt) · /).map((row) => row.props.children);
  expect(rows).toEqual(['21:00 · Hiányos · 1/3', '20:00 · Elmaradt · 0/3']);
  expect(screen.getByText(/Kimaradt: Pont 2, Pont 3/)).toBeOnTheScreen();
  expect(screen.getByText(/Nem történt leolvasás/)).toBeOnTheScreen();
  expect(screen.getByText(/^Útvonal 61$/)).toBeOnTheScreen();
  expect(screen.getByText(/^Útvonal 62$/)).toBeOnTheScreen();
});

it('tells when there are no more rounds and when the shift closes', async () => {
  setNow(local('23:35'));
  await step();
  await renderScreen();
  expect(screen.getByText('Nincs több kör ebben a műszakban')).toBeOnTheScreen();
  expect(screen.getByText('A műszak 00:30-kor automatikusan zárul.')).toBeOnTheScreen();
});

it('logs out when the shift closes while the screen is open', async () => {
  await renderScreen();
  const shift = loadGuardState(db, nowTimestamp())!.shift!;
  await act(async () => void (await write([shiftClosed({ shift_id: shift.id, closed_by: 'auto' })])));
  expect(useSession.getState().activeUser).toBeNull();
});

it('opens the incident and the shift close', async () => {
  const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
  await renderScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Esemény' }));
  expect(router.push).toHaveBeenLastCalledWith('/incident/new');
  fireEvent.press(screen.getByRole('button', { name: 'Műszakzárás' }));
  expect(router.push).toHaveBeenLastCalledWith('/shift/close');
});
