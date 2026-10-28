import { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } from '@modules/waypost-power';
import * as Notifications from 'expo-notifications';
import { AndroidAudioContentType, AndroidAudioUsage, AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { ROUNDS_CHANNEL_ID, ensureRoundsChannel } from './channel';
import { allAlarmPermissionsGranted, getAlarmPermissions, requestBatteryExemption, requestNotifications } from './permissions';
import { cancelTestAlarms, getScheduledTestAlarms, scheduleTestAlarms } from './test-alarms';

jest.mock('expo-notifications', () => ({
  ...jest.requireActual<object>('expo-notifications/build/NotificationChannelManager.types'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExactAlarmPermissionsAsync: jest.fn(),
  requestExactAlarmPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
}));
jest.mock('@modules/waypost-power', () => ({ isIgnoringBatteryOptimizations: jest.fn(), requestIgnoreBatteryOptimizations: jest.fn() }));

const native = jest.mocked(Notifications);

beforeEach(() => {
  jest.clearAllMocks();
  native.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as Notifications.NotificationPermissionsStatus);
  native.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
  jest.mocked(isIgnoringBatteryOptimizations).mockReturnValue(true);
  let next = 0;
  native.scheduleNotificationAsync.mockImplementation(async () => `n${next++}`);
});

describe('rounds channel', () => {
  test('Android: highest importance, own sound played as an alarm, vibration, visible on the lock screen', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await ensureRoundsChannel();
    expect(native.setNotificationChannelAsync).toHaveBeenCalledWith('rounds', {
      name: 'Körök ébresztése',
      description: 'Szól, amikor egy járőrkör indul.',
      importance: AndroidImportance.MAX,
      sound: 'round_alarm.wav',
      audioAttributes: { usage: AndroidAudioUsage.ALARM, contentType: AndroidAudioContentType.SONIFICATION },
      enableVibrate: true,
      vibrationPattern: expect.any(Array),
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    });
  });

  test('iOS: no channels', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await ensureRoundsChannel();
    expect(native.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('permissions', () => {
  test('Android: notifications, exact alarms and battery optimization', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const permissions = await getAlarmPermissions();
    expect(permissions).toEqual({ notifications: { granted: true, canAskAgain: true }, exactAlarms: false, batteryExempt: true });
    expect(allAlarmPermissionsGranted(permissions)).toBe(false);
    expect(allAlarmPermissionsGranted({ ...permissions, exactAlarms: true })).toBe(true);
  });

  test('iOS: only notifications exist', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const permissions = await getAlarmPermissions();
    expect(permissions).toEqual({ notifications: { granted: true, canAskAgain: true }, exactAlarms: null, batteryExempt: null });
    expect(native.getExactAlarmPermissionsAsync).not.toHaveBeenCalled();
    expect(isIgnoringBatteryOptimizations).not.toHaveBeenCalled();
    expect(allAlarmPermissionsGranted(permissions)).toBe(true);
  });

  test('asking: the system dialog while possible, then the settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await requestNotifications(true);
    expect(native.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
    expect(openSettings).not.toHaveBeenCalled();
    await requestNotifications(false);
    expect(openSettings).toHaveBeenCalledTimes(1);
    requestBatteryExemption();
    expect(requestIgnoreBatteryOptimizations).toHaveBeenCalledTimes(1);
  });
});

describe('test alarms', () => {
  test('replaces everything scheduled with 12 alarms on the rounds channel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const scheduled = await scheduleTestAlarms(new Date(2026, 9, 28, 21, 52, 30));

    expect(native.setNotificationChannelAsync).toHaveBeenCalled();
    expect(native.cancelAllScheduledNotificationsAsync.mock.invocationCallOrder[0]).toBeLessThan(
      native.scheduleNotificationAsync.mock.invocationCallOrder[0]!,
    );
    expect(scheduled).toHaveLength(12);
    expect(scheduled[0]).toEqual({ id: 'n0', at: new Date(2026, 9, 28, 22, 0) });

    const first = native.scheduleNotificationAsync.mock.calls[0]![0];
    expect(first.trigger).toEqual({ type: 'date', date: new Date(2026, 9, 28, 22, 0), channelId: ROUNDS_CHANNEL_ID, delivery: 'alarmClock' });
    expect(first.content).toMatchObject({
      title: 'Próbaébresztés 22:00',
      body: '1/12. értesítés. Ha késve szólt, írd fel, mennyit.',
      sound: 'round_alarm.wav',
      interruptionLevel: 'timeSensitive',
      data: { kind: 'm1-06-test', scheduledAt: new Date(2026, 9, 28, 22, 0).toISOString() },
    });
  });

  test('lists only the test alarms, earliest first', async () => {
    const request = (identifier: string, data: Record<string, unknown> | undefined) =>
      ({ identifier, content: { data }, trigger: null }) as unknown as Notifications.NotificationRequest;
    native.getAllScheduledNotificationsAsync.mockResolvedValue([
      request('b', { kind: 'm1-06-test', scheduledAt: '2026-10-28T21:15:00.000Z' }),
      request('other', { kind: 'something-else' }),
      request('a', { kind: 'm1-06-test', scheduledAt: '2026-10-28T21:00:00.000Z' }),
      request('no-data', undefined),
    ]);
    expect(await getScheduledTestAlarms()).toEqual([
      { id: 'a', at: new Date('2026-10-28T21:00:00.000Z') },
      { id: 'b', at: new Date('2026-10-28T21:15:00.000Z') },
    ]);
  });

  test('cancelling', async () => {
    await cancelTestAlarms();
    expect(native.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});
