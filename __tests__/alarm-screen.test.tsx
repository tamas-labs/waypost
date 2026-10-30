import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import { AppState, BackHandler, Vibration, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clearAlarm, muteAlarm, raiseAlarm, useActiveAlarms } from '@/alarms/active-alarms';
import { RINGING_VIBRATION } from '@/alarms/ringing';
import { ROUND_ALARM_KIND } from '@/alarms/round-alarms';
import AlarmScreen from '@/app/(guard)/alarm';
import { useSession } from '@/auth/session';
import { appendChainEntries } from '@/chain/writer';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { schedulerStep } from '@/domain/rounds';
import { guardLogin } from '@/domain/shift';
import { GUARD, idSequence, local, ROUTE_A, SCHEDULE_A } from '@/domain/testing';
import { loadGuardState } from '@/guard/state';
import { seedSite } from '@/guard/testing';
import { ThemeProvider } from '@/theme/theme-provider';
import { nowTimestamp } from '@/time/timestamp';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ notifyChainEntry: jest.fn(), requestSync: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-notifications', () => ({
  ...jest.requireActual<object>('expo-notifications/build/NotificationChannelManager.types'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-router', () => ({
  router: { dismissTo: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

let db: Database;
const newId = idSequence();
const { router } = jest.requireMock<{ router: { dismissTo: jest.Mock; back: jest.Mock } }>('expo-router');
const vibrate = jest.spyOn(Vibration, 'vibrate');
const cancelVibration = jest.spyOn(Vibration, 'cancel');

const slot = (time: string) => ({ route_id: ROUTE_A, schedule_id: SCHEDULE_A, scheduled_at: local(time) });
const setNow = (at: string) => jest.setSystemTime(Date.parse(at));
const write = (drafts: Parameters<typeof appendChainEntries>[1]) => appendChainEntries(db, drafts);
const step = () => write(schedulerStep(loadGuardState(db, nowTimestamp())!, nowTimestamp(), newId));
const player = () => jest.mocked(createAudioPlayer).mock.results.at(-1)!.value as { loop: boolean; play: jest.Mock; remove: jest.Mock };

beforeEach(async () => {
  jest.useFakeTimers({ now: Date.parse(local('19:55')), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  useActiveAlarms.setState({ alarms: [], muted: false });
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  await seedSite(db);
  useSession.setState({ mode: 'site_phone', activeUser: { id: GUARD, role: 'guard' }, shiftStart: null });
  await write(guardLogin(loadGuardState(db, nowTimestamp())!, GUARD, nowTimestamp(), newId).drafts);
  setNow(local('20:00'));
  jest.mocked(useLocalSearchParams).mockReturnValue(slot('20:00'));
});

afterEach(() => jest.useRealTimers());

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <AlarmScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

it('shows the round: its time, the points, the time limit and which route', async () => {
  await renderScreen();
  expect(screen.getByRole('header', { name: 'Indul a\n20:00-s kör' })).toBeOnTheScreen();
  // Hidden from a screen reader: the title says it.
  expect(screen.getByText('20:00', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByText('Útvonal 61 · 3 pont · 20 perc időkeret')).toBeOnTheScreen();
  expect(screen.queryByText(/Előző kör/)).not.toBeOnTheScreen();
});

it('shows the state of the previous round of the route', async () => {
  await step();
  setNow(local('21:00'));
  await step();
  jest.mocked(useLocalSearchParams).mockReturnValue(slot('21:00'));
  await renderScreen();
  expect(screen.getByText('Előző kör (20:00) elmaradt')).toBeOnTheScreen();
});

it('rings repeating sound and vibration until muted, and the screen stays', async () => {
  await renderScreen();
  expect(vibrate).toHaveBeenCalledWith(RINGING_VIBRATION, true);
  expect(player().loop).toBe(true);
  expect(player().play).toHaveBeenCalled();

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Hang némítása' })));
  expect(player().remove).toHaveBeenCalled();
  expect(cancelVibration).toHaveBeenCalled();
  expect(screen.getByRole('header', { name: 'Indul a\n20:00-s kör' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Hang némítva' })).toBeDisabled();
  expect(router.dismissTo).not.toHaveBeenCalled();
});

it('rings again when the reminder of the round comes after muting', async () => {
  await renderScreen();
  await act(async () => muteAlarm());
  const players = jest.mocked(createAudioPlayer).mock.calls.length;
  setNow(local('20:05'));
  await act(async () => raiseAlarm(db, { ...slot('20:00'), kind: ROUND_ALARM_KIND, alarm: 'reminder', fingerprint: '' }));
  expect(jest.mocked(createAudioPlayer).mock.calls.length).toBe(players + 1);
  expect(screen.getByRole('button', { name: 'Hang némítása' })).toBeEnabled();
});

it('stops ringing while the app is not active, and goes on when it comes back', async () => {
  let listener: (state: AppStateStatus) => void = () => {};
  const addListener = jest.mocked(AppState.addEventListener);
  const original = addListener.getMockImplementation();
  addListener.mockImplementation((_type, handler) => {
    listener = handler;
    return { remove: jest.fn() };
  });
  await renderScreen();
  const first = player();
  await act(async () => listener('background'));
  expect(first.remove).toHaveBeenCalled();
  await act(async () => listener('active'));
  expect(player()).not.toBe(first);
  expect(player().play).toHaveBeenCalled();
  addListener.mockImplementation(original);
});

it('opens the round with "Indulok" and stops ringing, opening the round first if the scheduler has not', async () => {
  await renderScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Indulok' })));
  const round = loadGuardState(db, nowTimestamp())!.rounds[0]!;
  expect(round.status).toBe('open');
  expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/round/[id]', params: { id: round.id } });
  expect(player().remove).toHaveBeenCalled();
  expect(cancelVibration).toHaveBeenCalled();
  const notifications = jest.requireMock<{ dismissNotificationAsync: jest.Mock }>('expo-notifications');
  expect(notifications.dismissNotificationAsync.mock.calls.map(([id]) => id)).toEqual([`round:${SCHEDULE_A}:${local('20:00')}`, `reminder:${SCHEDULE_A}:${local('20:00')}`]);
});

it('has no way back', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  await renderScreen();
  const press = add.mock.calls.find(([event]) => event === 'hardwareBackPress')![1];
  expect((press as () => boolean)()).toBe(true);
  add.mockRestore();
});

it('leaves by itself when the round closes meanwhile, without a second navigation', async () => {
  await renderScreen();
  await act(async () => void (await step()));
  expect(router.back).not.toHaveBeenCalled();
  setNow(local('20:20'));
  await act(async () => void (await step()));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(player().remove).toHaveBeenCalled();
  await act(async () => clearAlarm(slot('20:00')));
  expect(router.back).toHaveBeenCalledTimes(1);
});
