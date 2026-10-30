import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { raiseAlarm, useActiveAlarms } from '@/alarms/active-alarms';
import { alarmIdentifier, ROUND_ALARM_KIND, type RoundAlarmData } from '@/alarms/round-alarms';
import AuthLayout from '@/app/(auth)/_layout';
import LoginScreen from '@/app/(auth)/login';
import PinScreen from '@/app/(auth)/pin';
import GuardLayout from '@/app/(guard)/_layout';
import AlarmScreen from '@/app/(guard)/alarm';
import HomeScreen from '@/app/(guard)/home';
import NewIncidentScreen from '@/app/(guard)/incident/new';
import RoundScreen from '@/app/(guard)/round/[id]';
import ShiftCloseScreen from '@/app/(guard)/shift/close';
import ShiftStartScreen from '@/app/(guard)/shift-start';
import SupervisorLayout from '@/app/(supervisor)/_layout';
import SitesScreen from '@/app/(supervisor)/sites';
import DevLayout from '@/app/dev/_layout';
import DevToolsScreen from '@/app/dev/index';
import Index from '@/app/index';
import { useSession, type SessionState } from '@/auth/session';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { guardLogin } from '@/domain/shift';
import { GUARD as GUARD_ID, idSequence, local, ROUTE_A, ROUTE_B, SCHEDULE_A, SCHEDULE_B } from '@/domain/testing';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
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
  '(guard)/alarm': AlarmScreen,
  '(guard)/home': HomeScreen,
  '(guard)/incident/new': NewIncidentScreen,
  '(guard)/round/[id]': RoundScreen,
  '(guard)/shift/close': ShiftCloseScreen,
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
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
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

  it('goes from the shift home to the incident and the shift close, and back', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: GUARD }));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Esemény' })));
    expect(screen).toHavePathname('/incident/new');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vissza' })));
    expect(screen).toHavePathname('/home');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Műszakzárás' })));
    expect(screen).toHavePathname('/shift/close');
  });

  it('logs out from the shift home to the PIN screen', async () => {
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: GUARD }));
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

describe('the round alarm', () => {
  const newId = idSequence();
  let db: Database;

  const alarmData = (time: string): RoundAlarmData => ({ kind: ROUND_ALARM_KIND, alarm: 'round', route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local(time), fingerprint: alarmIdentifier('round', { route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local(time) }) });
  const setNow = (at: string) => jest.setSystemTime(Date.parse(at));
  const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
  const now = () => new Date().toISOString();

  beforeEach(async () => {
    jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
    useActiveAlarms.setState({ alarms: [], muted: false });
    ({ db } = await createTestDatabase());
    jest.mocked(getDatabase).mockReturnValue(db);
    await seedSite(db);
  });

  afterEach(() => {
    useActiveAlarms.setState({ alarms: [], muted: false });
    jest.useRealTimers();
  });

  async function startAsGuard() {
    await write(guardLogin(loadGuardState(db, now())!, GUARD_ID, now(), newId).drafts);
    setNow(local('20:00'));
    await start({ mode: 'site_phone', activeUser: null });
    await act(() => useSession.setState({ activeUser: { id: GUARD_ID, role: 'guard' } }));
    expect(screen).toHavePathname('/home');
  }

  it('opens the alarm screen over the screen of a logged-in guard, and goes on to the round', async () => {
    await startAsGuard();
    await act(async () => raiseAlarm(db, alarmData('20:00')));
    expect(screen).toHavePathname('/alarm');
    expect(screen.getByRole('header', { name: 'Indul a\n20:00-s kör' })).toBeOnTheScreen();

    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Indulok' })));
    const round = loadGuardState(db, now())!.rounds[0]!;
    expect(screen).toHavePathname(`/round/${round.id}`);
    expect(useActiveAlarms.getState().alarms).toEqual([]);
  });

  it('goes back to the round when the reminder rings over its screen', async () => {
    await startAsGuard();
    await act(async () => raiseAlarm(db, alarmData('20:00')));
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Indulok' })));
    const round = loadGuardState(db, now())!.rounds[0]!;

    setNow(local('20:05'));
    await act(async () => raiseAlarm(db, { ...alarmData('20:00'), alarm: 'reminder' }));
    expect(screen).toHavePathname('/alarm');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Indulok' })));
    expect(screen).toHavePathname(`/round/${round.id}`);
    // Back from the round: the screen under it, not the alarm or a second round.
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Vissza' })));
    expect(screen).toHavePathname('/home');
  });

  it('leaves the alarm screen when the round closes', async () => {
    await startAsGuard();
    await act(async () => raiseAlarm(db, alarmData('20:00')));
    await act(async () => void (await write(schedulerStep(loadGuardState(db, now())!, now(), newId))));
    expect(screen).toHavePathname('/alarm');
    setNow(local('20:20'));
    await act(async () => void (await write(schedulerStep(loadGuardState(db, now())!, now(), newId))));
    expect(screen).toHavePathname('/home');
    expect(useActiveAlarms.getState().alarms).toEqual([]);
  });

  it('shows the next alarm after the first', async () => {
    await startAsGuard();
    setNow(local('21:00'));
    // B's 20:30 has no time limit: it runs until the route's next round.
    const second = { ...alarmData('20:00'), route_id: ROUTE_B, schedule_id: SCHEDULE_B, scheduled_at: local('20:30') };
    await act(async () => {
      raiseAlarm(db, alarmData('21:00'));
      raiseAlarm(db, second);
    });
    expect(screen.getByRole('header', { name: 'Indul a\n21:00-s kör' })).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Indulok' })));
    expect(screen).toHavePathname('/alarm');
    expect(screen.getByRole('header', { name: 'Indul a\n20:30-s kör' })).toBeOnTheScreen();
  });

  it('stays on the PIN screen without a logged-in guard', async () => {
    await write(guardLogin(loadGuardState(db, now())!, GUARD_ID, now(), newId).drafts);
    setNow(local('20:00'));
    await start({ mode: 'site_phone', activeUser: null });
    await act(async () => raiseAlarm(db, alarmData('20:00')));
    expect(screen).toHavePathname('/pin');
    expect(useActiveAlarms.getState().alarms).toEqual([]);
  });

  it('ends the alarms when the guard is logged out', async () => {
    await startAsGuard();
    await act(async () => raiseAlarm(db, alarmData('20:00')));
    await act(() => useSession.setState({ activeUser: null }));
    expect(screen).toHavePathname('/pin');
    expect(useActiveAlarms.getState().alarms).toEqual([]);
  });
});
