import { addNotificationReceivedListener } from 'expo-notifications';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { showAlarmsInForeground } from '@/alarms/foreground';
import {
  getAlarmPermissions,
  requestBatteryExemption,
  requestExactAlarms,
  requestNotifications,
  type AlarmPermissions,
} from '@/alarms/permissions';
import { cancelTestAlarms, getScheduledTestAlarms, scheduleTestAlarms, type ScheduledTestAlarm } from '@/alarms/test-alarms';
import { TEST_EVERY_MIN, TEST_HOURS } from '@/alarms/test-schedule';
import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

interface Arrival {
  key: number;
  at: Date;
  scheduledAt: Date | null;
}

/** The screen keeps the latest arrivals only. */
const MAX_ARRIVALS = 20;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM, local time. */
function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** HH:MM:SS, local time. */
function formatTimeSeconds(date: Date): string {
  return `${formatTime(date)}:${pad(date.getSeconds())}`;
}

// M1-06 device test: the permissions the round alarms need, and a series of notifications every 15 minutes for
// 3 hours, to check that each sounds on time with the screen locked, the app in the background and closed.
export default function AlarmsScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const [permissions, setPermissions] = useState<AlarmPermissions | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledTestAlarm[]>([]);
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(0);

  const refresh = useCallback(
    () =>
      Promise.all([getAlarmPermissions(), getScheduledTestAlarms()]).then(
        ([current, pending]) => {
          setPermissions(current);
          setScheduled(pending);
        },
        (e: unknown) => setError(errorText(e)),
      ),
    [],
  );

  // Checked again when the app comes back, e.g. from the system settings.
  useEffect(() => {
    showAlarmsInForeground();
    void refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const received = addNotificationReceivedListener((notification) => {
      const value = notification.request.content.data?.scheduledAt;
      const scheduledAt = typeof value === 'string' ? new Date(value) : null;
      const key = nextKey.current++;
      setArrivals((previous) => [{ key, at: new Date(), scheduledAt }, ...previous].slice(0, MAX_ARRIVALS));
      void refresh();
    });
    return () => {
      appState.remove();
      received.remove();
    };
  }, [refresh]);

  const run = async (action: () => Promise<unknown> | void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const label = [typography.label, { color: color.text2 }];
  const body = [typography.bodyRegular, { color: color.text }];
  const small = [typography.small, styles.tabular, { color: color.text2 }];
  const card = { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.card, padding: space.l, gap: space.m };
  const secondary = [styles.button, { backgroundColor: color.bg, borderRadius: radius.pill, minHeight: size.buttonSecondary, paddingHorizontal: space.l }];

  const button = (title: TranslationKey, onPress: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={secondary}>
      <Text style={[typography.buttonSm, { color: color.text }]}>{t(title)}</Text>
    </Pressable>
  );

  /** One permission: its name, its state in colour and words, and the button that fixes it. */
  const row = (name: TranslationKey, ok: boolean, okText: TranslationKey, missingText: TranslationKey, fix: ReactNode) => (
    <View style={{ gap: space.xs }}>
      <Text style={label}>{t(name)}</Text>
      <Text style={[typography.body, { color: ok ? color.ok : color.miss }]}>{t(ok ? okText : missingText)}</Text>
      {!ok && fix}
    </View>
  );

  const notificationsGranted = permissions?.notifications.granted === true;
  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Stack.Screen options={{ title: t('prototype.alarms.title') }} />

      <View style={[styles.card, card]}>
        {permissions === null ? (
          <Text style={[typography.body, { color: color.text2 }]}>{t('prototype.alarms.checking')}</Text>
        ) : (
          <>
            {row(
              'prototype.alarms.notifications',
              permissions.notifications.granted,
              'prototype.alarms.allowed',
              'prototype.alarms.notAllowed',
              button(permissions.notifications.canAskAgain ? 'prototype.alarms.allow' : 'prototype.alarms.openSettings', () =>
                run(() => requestNotifications(permissions.notifications.canAskAgain)),
              ),
            )}
            {permissions.exactAlarms !== null &&
              row(
                'prototype.alarms.exactAlarms',
                permissions.exactAlarms,
                'prototype.alarms.allowed',
                'prototype.alarms.notAllowed',
                button('prototype.alarms.allow', () => run(requestExactAlarms)),
              )}
            {permissions.batteryExempt !== null &&
              row(
                'prototype.alarms.battery',
                permissions.batteryExempt,
                'prototype.alarms.batteryExempt',
                'prototype.alarms.batteryOptimized',
                button('prototype.alarms.batteryFix', () => run(requestBatteryExemption)),
              )}
            {Platform.OS === 'ios' && (
              <View style={{ gap: space.xs }}>
                <Text style={label}>{t('prototype.alarms.timeSensitive')}</Text>
                <Text style={body}>{t('prototype.alarms.timeSensitiveHint')}</Text>
                {button('prototype.alarms.openSettings', () => run(() => Linking.openSettings()))}
              </View>
            )}
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !notificationsGranted }}
        disabled={busy || !notificationsGranted}
        onPress={() => run(scheduleTestAlarms)}
        style={[
          styles.button,
          { backgroundColor: color.accent, borderRadius: radius.pill, minHeight: size.buttonHero, opacity: busy || !notificationsGranted ? 0.5 : 1 },
        ]}
      >
        <Text style={[typography.button, { color: color.onAccent }]}>{t('prototype.alarms.schedule', { hours: TEST_HOURS, every: TEST_EVERY_MIN })}</Text>
      </Pressable>
      {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{t('prototype.alarms.error', { error })}</Text>}

      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.alarms.scheduled', { count: scheduled.length })}</Text>
        {scheduled.length === 0 ? (
          <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.alarms.noneScheduled')}</Text>
        ) : (
          <>
            <Text style={[body, styles.tabular]}>{scheduled.map(({ at }) => formatTime(at)).join(' · ')}</Text>
            {button('prototype.alarms.cancel', () => run(cancelTestAlarms))}
          </>
        )}
      </View>

      <View style={[styles.card, card]}>
        <Text style={label}>{t('prototype.alarms.arrivals')}</Text>
        {arrivals.length === 0 && <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.alarms.noArrivals')}</Text>}
        {arrivals.map(({ key, at, scheduledAt }) => (
          <Text key={key} style={small}>
            {scheduledAt === null
              ? formatTimeSeconds(at)
              : t('prototype.alarms.arrival', {
                  time: formatTimeSeconds(at),
                  scheduled: formatTime(scheduledAt),
                  delay: Math.round((at.getTime() - scheduledAt.getTime()) / 1000),
                })}
          </Text>
        ))}
      </View>

      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.alarms.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
});
