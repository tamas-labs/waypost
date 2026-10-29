import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ShiftStartScreen from '@/app/(guard)/shift-start';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { siteUser, users } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { GUARD, local, ROUTE_A, ROUTE_B, SITE } from '@/domain/testing';
import { fixReadiness, getReadiness, type Readiness } from '@/guard/readiness';
import { seedSite } from '@/guard/testing';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/guard/readiness', () => ({ ...jest.requireActual<object>('@/guard/readiness'), getReadiness: jest.fn(), fixReadiness: jest.fn() }));
jest.mock('@/nfc/reader', () => ({ getNfcStatus: jest.fn(), openNfcSettings: jest.fn() }));
jest.mock('@/guard/scheduler', () => ({ requestSchedulerStep: jest.fn() }));
jest.mock('@/alarms/permissions', () => ({}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const AT = '2026-10-27T12:00:00.000Z';
const READY: Readiness = {
  nfc: { supported: true, enabled: true },
  alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true },
  location: { granted: true, canAskAgain: true },
};

let db: Database;

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:56')), doNotFake: ['nextTick', 'setImmediate'] });
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  jest.mocked(getReadiness).mockResolvedValue(READY);
  jest.mocked(fixReadiness).mockResolvedValue();
  await seedSite(db);
  db.insert(users).values({ id: GUARD, name: 'Nagy Péter', role: 'guard', pin_hash: null, pin_salt: null, pin_iterations: null, active: true, created_at: AT, updated_at: AT }).run();
  db.insert(siteUser).values({ site_id: SITE, user_id: GUARD }).run();
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: { handover: null } });
});

afterEach(() => jest.useRealTimers());

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ShiftStartScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

it('greets the guard and shows the night: times, routes and rounds', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'Szia, Nagy Péter!' })).toBeOnTheScreen();
  expect(screen.getByText('20:00 – 23:00')).toBeOnTheScreen();
  expect(screen.getByText(`Útvonal ${ROUTE_A.slice(-2)} · 3 pont`)).toBeOnTheScreen();
  expect(screen.getByText('4 · óránként · 20 perc')).toBeOnTheScreen();
  expect(screen.getByText(`Útvonal ${ROUTE_B.slice(-2)} · 2 pont`)).toBeOnTheScreen();
  // Route B has a list schedule without a time limit.
  expect(screen.getByText('2 · 2 időpont')).toBeOnTheScreen();
  expect(screen.queryByText(/műszakját lezártuk/)).toBeNull();
});

it('tells the handover', async () => {
  useSession.setState({ shiftStart: { handover: { guard_name: 'Kiss Gábor', at: local('19:56') } } });
  await renderScreen();
  expect(screen.getByText('Kiss Gábor műszakját lezártuk (átadás 19:56). Ez a jelentésben is látszik.')).toBeOnTheScreen();
});

it('lists the readiness, and offers the fix of what is missing', async () => {
  const notReady = { ...READY, alarms: { ...READY.alarms, batteryExempt: false } };
  jest.mocked(getReadiness).mockResolvedValue(notReady);
  await renderScreen();
  expect(await screen.findByText('NFC bekapcsolva')).toBeOnTheScreen();
  expect(screen.getByText('Ébresztés engedélyezve')).toBeOnTheScreen();
  expect(screen.getByText('Késhet az ébresztés')).toBeOnTheScreen();

  jest.mocked(getReadiness).mockResolvedValue(READY);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Javítás' })));
  expect(fixReadiness).toHaveBeenCalledWith('battery', notReady);
  // Checked again after the fix.
  expect(await screen.findByText('Akkumulátorkímélés kikapcsolva')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Javítás' })).toBeNull();
});
