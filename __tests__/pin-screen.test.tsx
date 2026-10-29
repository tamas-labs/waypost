import { pinVectors } from '@waypost/schema/vectors';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getAlarmPermissions, type AlarmPermissions } from '@/alarms/permissions';
import PinScreen from '@/app/(auth)/pin';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { setKv } from '@/db/kv';
import { shifts, siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { GUARD, local, SITE } from '@/domain/testing';
import { playFeedback } from '@/feedback/feedback';
import { seedSite } from '@/guard/testing';
import { ThemeProvider } from '@/theme/theme-provider';

let mockUptime = 5_000_000;
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => mockUptime, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));
jest.mock('@/alarms/permissions', () => ({ ...jest.requireActual<object>('@/alarms/permissions'), getAlarmPermissions: jest.fn() }));

const GRANTED: AlarmPermissions = { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true };
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const basic = pinVectors.cases.find((c) => c.name === 'basic')!;
const AT = '2026-10-27T12:00:00.000Z';
/** PBKDF2 with 100 000 iterations is slow when the test suites run in parallel. */
const CHECK_TIMEOUT_MS = 10_000;

let db: Database;

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:40')), doNotFake: ['nextTick', 'setImmediate'] });
  mockUptime = 5_000_000;
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  jest.mocked(getAlarmPermissions).mockResolvedValue(GRANTED);
  jest.mocked(playFeedback).mockClear();
  useSession.setState({ mode: 'site_phone', deviceId: null, activeUser: null });
});

afterEach(() => jest.useRealTimers());

async function seed() {
  await seedSite(db);
  const { pin_hash, pin_salt, pin_iterations } = basic;
  db.insert(users).values({ id: GUARD, name: 'Kovács Péter', role: 'guard', pin_hash, pin_salt, pin_iterations, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: GUARD }).run();
}

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <PinScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const key = (name: string) => screen.getByRole('button', { name });

async function enter(pin: string) {
  for (const digit of pin) await act(async () => fireEvent.press(key(digit)));
}

it('waits for the site before anyone can log in', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'PIN-belépés' })).toBeOnTheScreen();
  expect(screen.getByText(/^A telephely adatai még nem érkeztek meg/)).toBeOnTheScreen();
  expect(key('1')).toBeDisabled();
});

it('shows the site, a greeting by the site’s clock and when the shift starts', async () => {
  await seed();
  await renderScreen();
  expect(screen.getByText('Raktár')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Jó estét!' })).toBeOnTheScreen();
  expect(screen.getByText('A műszak 20:00-kor kezdődik')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Online' })).toBeOnTheScreen();
});

it('starts the shift with a guard’s PIN once all six digits are in', async () => {
  await seed();
  await renderScreen();
  await enter(basic.pin.slice(0, 5));
  expect(screen.getByLabelText('5 számjegy megadva a 6-ból')).toBeOnTheScreen();
  expect(key('Műszak kezdése')).toBeDisabled();
  // A seventh digit is not taken.
  await enter(basic.pin.slice(5) + '1');
  expect(screen.getByLabelText('6 számjegy megadva a 6-ból')).toBeOnTheScreen();

  await act(async () => fireEvent.press(key('Műszak kezdése')));
  // PBKDF2 runs off the JS thread.
  await waitFor(() => expect(useSession.getState().activeUser).toEqual({ id: GUARD, role: 'guard' }), { timeout: CHECK_TIMEOUT_MS });
  expect(db.select({ guard_id: shifts.guard_id }).from(shifts).all()).toEqual([{ guard_id: GUARD }]);
});

it('tells a wrong PIN, with the error feedback, and empties the dots', async () => {
  await seed();
  await renderScreen();
  await enter('000000');
  await act(async () => fireEvent.press(key('Műszak kezdése')));
  expect(await screen.findByText('Hibás PIN-kód', {}, { timeout: CHECK_TIMEOUT_MS })).toBeOnTheScreen();
  expect(playFeedback).toHaveBeenCalledWith('error');
  expect(screen.getByLabelText('0 számjegy megadva a 6-ból')).toBeOnTheScreen();
  expect(useSession.getState().activeUser).toBeNull();
});

it('counts down a lock with the keypad off', async () => {
  await seed();
  setKv(db, 'pin.lockout', { failures: 5, lock: { duration_ms: 5 * 60_000, started_uptime_ms: mockUptime, boot_id: 'android-boot:12' } });
  await renderScreen();
  expect(screen.getByText('Túl sok hibás PIN-kód. Újra próbálhatod 5:00 múlva.')).toBeOnTheScreen();
  expect(key('1')).toBeDisabled();

  mockUptime += 61_000;
  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Túl sok hibás PIN-kód. Újra próbálhatod 3:59 múlva.')).toBeOnTheScreen();

  mockUptime += 4 * 60_000;
  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.queryByText(/^Túl sok hibás PIN-kód/)).toBeNull();
  expect(key('1')).toBeEnabled();
});

it('warns when the alarms cannot ring as they should', async () => {
  jest.mocked(getAlarmPermissions).mockResolvedValue({ ...GRANTED, exactAlarms: false, batteryExempt: false });
  await seed();
  await renderScreen();
  expect(await screen.findByText(/Hiányzik: pontos riasztás, akkumulátorkímélés alóli kivétel\. Szólj a supervisornak\.$/)).toBeOnTheScreen();
});

it('explains the supervisor key: supervisors use their own PIN', async () => {
  await seed();
  await renderScreen();
  await act(async () => fireEvent.press(key('Supervisor mód')));
  expect(screen.getByText(/^Supervisorként is a saját PIN-kódoddal lépsz be/)).toBeOnTheScreen();
});
