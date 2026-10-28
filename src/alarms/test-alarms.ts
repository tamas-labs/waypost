// Scheduling the M1-06 test notifications on the `rounds` channel.
import {
  SchedulableTriggerInputTypes,
  cancelAllScheduledNotificationsAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
} from 'expo-notifications';

import { t } from '@/i18n';

import { ROUNDS_CHANNEL_ID, ROUND_ALARM_SOUND, ROUND_ALARM_VIBRATION, ensureRoundsChannel } from './channel';
import { testAlarmTimes } from './test-schedule';

/** Marks the test notifications in their data, so the screen lists only these. */
const TEST_KIND = 'm1-06-test';

export interface ScheduledTestAlarm {
  id: string;
  at: Date;
}

/** HH:MM, local time. */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Replaces every scheduled notification with the test series (every 15 minutes for 3 hours). Android: `alarmClock`
 * delivery (AlarmManager.setAlarmClock), which Doze does not defer; without the exact alarm permission Android falls
 * back to inexact delivery. iOS: time-sensitive, so a Focus mode lets it through.
 */
export async function scheduleTestAlarms(now: Date = new Date()): Promise<ScheduledTestAlarm[]> {
  await ensureRoundsChannel();
  await cancelAllScheduledNotificationsAsync();
  const times = testAlarmTimes(now);
  const scheduled: ScheduledTestAlarm[] = [];
  for (const [index, at] of times.entries()) {
    const id = await scheduleNotificationAsync({
      content: {
        title: t('prototype.alarms.notificationTitle', { time: formatTime(at) }),
        body: t('prototype.alarms.notificationBody', { n: index + 1, total: times.length }),
        data: { kind: TEST_KIND, scheduledAt: at.toISOString() },
        sound: ROUND_ALARM_SOUND,
        vibrate: ROUND_ALARM_VIBRATION,
        interruptionLevel: 'timeSensitive',
      },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: at, channelId: ROUNDS_CHANNEL_ID, delivery: 'alarmClock' },
    });
    scheduled.push({ id, at });
  }
  return scheduled;
}

/** The test notifications still waiting, earliest first. */
export async function getScheduledTestAlarms(): Promise<ScheduledTestAlarm[]> {
  const requests = await getAllScheduledNotificationsAsync();
  return requests
    .flatMap(({ identifier, content }) => {
      const { kind, scheduledAt } = content.data ?? {};
      return kind === TEST_KIND && typeof scheduledAt === 'string' ? [{ id: identifier, at: new Date(scheduledAt) }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function cancelTestAlarms(): Promise<void> {
  await cancelAllScheduledNotificationsAsync();
}
