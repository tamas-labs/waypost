import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { addNotificationReceivedListener, type Notification } from 'expo-notifications';
import { Platform } from 'react-native';

import { showAlarmsInForeground } from '@/alarms/foreground';
import { getAlarmPermissions, requestBatteryExemption, requestExactAlarms, requestNotifications, type AlarmPermissions } from '@/alarms/permissions';
import { cancelTestAlarms, getScheduledTestAlarms, scheduleTestAlarms } from '@/alarms/test-alarms';
import AlarmsScreen from '@/app/prototype/alarms';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: jest.fn() }));
jest.mock('@/alarms/foreground', () => ({ showAlarmsInForeground: jest.fn() }));
jest.mock('@/alarms/permissions', () => ({
  getAlarmPermissions: jest.fn(),
  requestNotifications: jest.fn(),
  requestExactAlarms: jest.fn(),
  requestBatteryExemption: jest.fn(),
}));
jest.mock('@/alarms/test-alarms', () => ({ scheduleTestAlarms: jest.fn(), getScheduledTestAlarms: jest.fn(), cancelTestAlarms: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

const permissions = jest.mocked(getAlarmPermissions);
const scheduled = jest.mocked(getScheduledTestAlarms);
const removeListener = jest.fn();

const ANDROID_MISSING: AlarmPermissions = { notifications: { granted: true, canAskAgain: true }, exactAlarms: false, batteryExempt: false };
const ANDROID_OK: AlarmPermissions = { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true };

beforeEach(() => {
  jest.clearAllMocks();
  permissions.mockResolvedValue(ANDROID_OK);
  scheduled.mockResolvedValue([]);
  jest.mocked(addNotificationReceivedListener).mockReturnValue({ remove: removeListener });
});

async function renderScreen(os: 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
  const result = await render(
    <ThemeProvider>
      <AlarmsScreen />
    </ThemeProvider>,
  );
  await act(async () => {});
  return result;
}

test('Android: shows the missing permissions with a button each', async () => {
  permissions.mockResolvedValue(ANDROID_MISSING);
  await renderScreen('android');
  expect(showAlarmsInForeground).toHaveBeenCalled();
  expect(screen.getByText('Pontos riasztás')).toBeOnTheScreen();
  expect(screen.getByText('Optimalizált – késleltetheti az ébresztést')).toBeOnTheScreen();
  expect(screen.queryByText('Időérzékeny értesítések')).toBeNull();

  await act(async () => fireEvent.press(screen.getByText('Engedélyezés')));
  expect(requestExactAlarms).toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Kivétel kérése')));
  expect(requestBatteryExemption).toHaveBeenCalled();
  expect(requestNotifications).not.toHaveBeenCalled();
});

test('Android: everything allowed, no buttons', async () => {
  await renderScreen('android');
  expect(screen.getAllByText('Engedélyezve')).toHaveLength(2);
  expect(screen.getByText('Kivétel – nem korlátozza az ébresztést')).toBeOnTheScreen();
  expect(screen.queryByText('Engedélyezés')).toBeNull();
});

test('iOS: notifications and the time-sensitive hint only', async () => {
  permissions.mockResolvedValue({ notifications: { granted: false, canAskAgain: false }, exactAlarms: null, batteryExempt: null });
  await renderScreen('ios');
  expect(screen.queryByText('Pontos riasztás')).toBeNull();
  expect(screen.queryByText('Akkumulátor-optimalizálás')).toBeNull();
  expect(screen.getByText('Időérzékeny értesítések')).toBeOnTheScreen();
  // Refused for good: both buttons open the settings.
  await act(async () => fireEvent.press(screen.getAllByText('Beállítások megnyitása')[0]!));
  expect(requestNotifications).toHaveBeenCalledWith(false);
});

test('scheduling the series and cancelling it', async () => {
  await renderScreen('android');
  expect(screen.getByText('Nincs ütemezett értesítés.')).toBeOnTheScreen();

  scheduled.mockResolvedValue([
    { id: 'a', at: new Date(2026, 9, 28, 22, 0) },
    { id: 'b', at: new Date(2026, 9, 28, 22, 15) },
  ]);
  await act(async () => fireEvent.press(screen.getByText('Ütemezés: 3 óra, 15 percenként')));
  expect(scheduleTestAlarms).toHaveBeenCalled();
  expect(screen.getByText('Ütemezett értesítések: 2')).toBeOnTheScreen();
  expect(screen.getByText('22:00 · 22:15')).toBeOnTheScreen();

  await act(async () => fireEvent.press(screen.getByText('Összes törlése')));
  expect(cancelTestAlarms).toHaveBeenCalled();
});

test('no scheduling without the notification permission', async () => {
  permissions.mockResolvedValue({ ...ANDROID_OK, notifications: { granted: false, canAskAgain: true } });
  await renderScreen('android');
  await act(async () => fireEvent.press(screen.getByText('Ütemezés: 3 óra, 15 percenként')));
  expect(scheduleTestAlarms).not.toHaveBeenCalled();
});

test('an error is shown', async () => {
  jest.mocked(scheduleTestAlarms).mockRejectedValue(new Error('Exact alarms not allowed'));
  await renderScreen('android');
  await act(async () => fireEvent.press(screen.getByText('Ütemezés: 3 óra, 15 percenként')));
  expect(screen.getByText('Hiba: Exact alarms not allowed')).toBeOnTheScreen();
});

test('a notification arriving in the foreground is listed with its delay', async () => {
  const { unmount } = await renderScreen('android');
  const onReceived = jest.mocked(addNotificationReceivedListener).mock.calls[0]![0];
  const scheduledAt = new Date(Date.now() - 4000);
  await act(async () => onReceived({ request: { content: { data: { scheduledAt: scheduledAt.toISOString() } } } } as unknown as Notification));
  expect(screen.getByText(/ · ütemezve \d\d:\d\d · \+4 mp$/)).toBeOnTheScreen();

  await act(async () => unmount());
  expect(removeListener).toHaveBeenCalled();
});
