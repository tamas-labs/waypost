import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import AuthLayout from '@/app/(auth)/_layout';
import LoginScreen from '@/app/(auth)/login';
import PinScreen from '@/app/(auth)/pin';
import GuardLayout from '@/app/(guard)/_layout';
import HomeScreen from '@/app/(guard)/home';
import ShiftStartScreen from '@/app/(guard)/shift-start';
import SupervisorLayout from '@/app/(supervisor)/_layout';
import SitesScreen from '@/app/(supervisor)/sites';
import DevLayout from '@/app/dev/_layout';
import DevToolsScreen from '@/app/dev/index';
import Index from '@/app/index';
import { useSession, type SessionState } from '@/auth/session';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { AppStack } from '@/navigation/app-stack';
import { ThemeProvider } from '@/theme/theme-provider';

function RootLayout() {
  return (
    <ThemeProvider>
      <AppStack />
    </ThemeProvider>
  );
}

const ROUTES = {
  _layout: RootLayout,
  index: Index,
  '(auth)/_layout': AuthLayout,
  '(auth)/login': LoginScreen,
  '(auth)/pin': PinScreen,
  '(guard)/_layout': GuardLayout,
  '(guard)/home': HomeScreen,
  '(guard)/shift-start': ShiftStartScreen,
  '(supervisor)/_layout': SupervisorLayout,
  '(supervisor)/sites': SitesScreen,
  'dev/_layout': DevLayout,
  'dev/index': DevToolsScreen,
  'prototype/_layout': DevLayout,
  'prototype/clock': () => null,
};

// The PIN screen reads the database (nothing pulled: the screen waits for the site) and the alarm settings.
jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
// The readiness check stays pending (NFC is native).
jest.mock('@/guard/readiness', () => ({ getReadiness: () => new Promise(() => {}), readinessRows: () => [], fixReadiness: jest.fn() }));
jest.mock('@/alarms/permissions', () => ({
  ...jest.requireActual<object>('@/alarms/permissions'),
  getAlarmPermissions: () => Promise.resolve({ notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true }),
}));

beforeEach(async () => {
  const { db } = await createTestDatabase();
  jest.mocked(getDatabase).mockReturnValue(db);
});

const GUARD = { id: '01900000-0000-7000-8000-0000000000a1', role: 'guard' as const };

async function start(session: Pick<SessionState, 'mode' | 'activeUser'>, initialUrl = '/') {
  useSession.setState({ ...session, deviceId: null, shiftStart: null });
  await renderRouter(ROUTES, { initialUrl });
}

describe('navigation by start state', () => {
  it('sends a phone that is not enrolled to the supervisor login', async () => {
    await start({ mode: 'unassigned', activeUser: null });
    expect(screen).toHavePathname('/login');
    expect(screen.getByText('Supervisor belépés')).toBeOnTheScreen();
  });

  it('sends the site phone to the PIN login', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    expect(screen).toHavePathname('/pin');
    expect(screen.getByText('PIN-belépés')).toBeOnTheScreen();
  });

  it("sends a supervisor's own phone to the site list", async () => {
    await start({ mode: 'supervisor_phone', activeUser: null });
    expect(screen).toHavePathname('/sites');
  });

  it('opens the guard mode after a guard PIN login, and leaves it at logout', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: GUARD }));
    expect(screen).toHavePathname('/home');
    await act(() => useSession.setState({ activeUser: null }));
    expect(screen).toHavePathname('/pin');
  });

  it('shows the shift start after a login that started a shift, then the shift home', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: GUARD, shiftStart: { handover: null } }));
    expect(screen).toHavePathname('/shift-start');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Műszak indítása' })));
    expect(screen).toHavePathname('/home');
    expect(useSession.getState().shiftStart).toBeNull();
  });

  it('logs out from the shift start to the PIN screen', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: GUARD, shiftStart: { handover: null } }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Kilépés a PIN-képernyőre' })));
    expect(screen).toHavePathname('/pin');
  });

  it('switches to the PIN login when the phone gets enrolled', async () => {
    await start({ mode: 'unassigned', activeUser: null });
    await act(() => useSession.setState({ mode: 'site_phone' }));
    expect(screen).toHavePathname('/pin');
  });

  it('does not open a screen of another mode', async () => {
    await start({ mode: 'site_phone', activeUser: null }, '/sites');
    expect(screen).toHavePathname('/pin');
    await screen.unmount();
    await start({ mode: 'supervisor_phone', activeUser: null }, '/home');
    expect(screen).toHavePathname('/sites');
  });

  it('opens the developer tools in development builds', async () => {
    await start({ mode: 'unassigned', activeUser: null }, '/dev');
    expect(screen).toHavePathname('/dev');
    expect(screen.getByText('Állapot: nincs hozzárendelve')).toBeOnTheScreen();
  });
});
