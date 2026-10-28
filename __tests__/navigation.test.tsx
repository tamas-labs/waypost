import { act, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import AuthLayout from '@/app/(auth)/_layout';
import LoginScreen from '@/app/(auth)/login';
import PinScreen from '@/app/(auth)/pin';
import GuardLayout from '@/app/(guard)/_layout';
import HomeScreen from '@/app/(guard)/home';
import SupervisorLayout from '@/app/(supervisor)/_layout';
import SitesScreen from '@/app/(supervisor)/sites';
import DevLayout from '@/app/dev/_layout';
import DevToolsScreen from '@/app/dev/index';
import Index from '@/app/index';
import { useSession, type SessionState } from '@/auth/session';
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
  '(supervisor)/_layout': SupervisorLayout,
  '(supervisor)/sites': SitesScreen,
  'dev/_layout': DevLayout,
  'dev/index': DevToolsScreen,
  'prototype/_layout': DevLayout,
  'prototype/clock': () => null,
};

const GUARD = { id: '01900000-0000-7000-8000-0000000000a1', role: 'guard' as const };

async function start(session: Pick<SessionState, 'mode' | 'activeUser'>, initialUrl = '/') {
  useSession.setState({ ...session, deviceId: null });
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
