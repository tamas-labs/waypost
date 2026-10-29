import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CheckRow } from '@/components/check-row';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { getDatabase } from '@/db/open';
import type { ScheduleOfRoute } from '@/domain/schedule';
import { loadShiftStartInfo, type ShiftStartInfo } from '@/guard/login';
import { fixReadiness, getReadiness, readinessRows, type Readiness, type ReadinessItem, type ReadinessRow } from '@/guard/readiness';
import { t, type TranslationKey } from '@/i18n';
import { onConfigurationPulled } from '@/sync/events';
import { useTheme } from '@/theme/theme-provider';
import { parseTimestamp } from '@/time/timestamp';
import { localTimeOf } from '@/time/zone';

/** "óránként", "2 óránként", "30 percenként"; a list schedule by its number of times. */
function cadence(schedule: ScheduleOfRoute): string {
  if (schedule.mode === 'list') return t('shiftStart.timesCount', { count: schedule.start_times?.length ?? 0 });
  const every = schedule.interval_every_min ?? 0;
  if (every === 60) return t('shiftStart.everyHour');
  if (every > 0 && every % 60 === 0) return t('shiftStart.everyHours', { hours: every / 60 });
  return t('shiftStart.everyMinutes', { minutes: every });
}

/** "13 · óránként · 25 perc": the rounds of the night, how often, and the time limit when the schedules share one. */
function roundsLine(rounds: number, schedules: readonly ScheduleOfRoute[]): string {
  const parts = [String(rounds), ...schedules.map(cadence)];
  const limits = new Set(schedules.map((schedule) => schedule.time_limit_min));
  const [limit] = limits;
  if (limits.size === 1 && limit !== null && limit !== undefined) parts.push(t('shiftStart.limit', { minutes: limit }));
  return parts.join(' · ');
}

const ROW_TEXT: Record<ReadinessItem, { ok: TranslationKey; label: TranslationKey; detail: TranslationKey }> = {
  nfc: { ok: 'shiftStart.nfcOn', label: 'shiftStart.nfc', detail: 'shiftStart.nfcOff' },
  alarms: { ok: 'shiftStart.alarmAllowed', label: 'shiftStart.alarms', detail: 'shiftStart.alarmsOff' },
  location: { ok: 'shiftStart.locationOn', label: 'shiftStart.location', detail: 'shiftStart.locationOff' },
  battery: { ok: 'shiftStart.batteryOn', label: 'shiftStart.battery', detail: 'shiftStart.batteryWarn' },
};

/** The readiness of the phone, checked again when the app comes back (from a system dialog or the settings). */
function useReadiness(): [Readiness | null, () => void] {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const check = useCallback(() => {
    getReadiness().then(setReadiness, (error: unknown) => __DEV__ && console.warn('Checking the readiness failed', error));
  }, []);
  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => subscription.remove();
  }, [check]);
  return [readiness, check];
}

/** The shift's night, reloaded after a pull. */
function useShiftStartInfo(guardId: string | null): ShiftStartInfo | null {
  const load = useCallback(() => (guardId === null ? null : loadShiftStartInfo(getDatabase(), guardId)), [guardId]);
  const [info, setInfo] = useState(load);
  useEffect(() => onConfigurationPulled(() => setInfo(load())), [load]);
  return info;
}

// Shift start (G2, B-Muszakkezdes): after a guard's PIN started a shift (or took one over). The shift, its routes and
// rounds, the handover if there was one, and whether the phone is ready; a missing setting warns but does not stop
// the shift. The shift is already open (the PIN login wrote it): "Műszak indítása" goes on to the shift home, the
// back button logs out to the PIN screen.
export default function ShiftStartScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { guardId, shiftStart } = useSession(useShallow(({ activeUser, shiftStart }) => ({ guardId: activeUser?.id ?? null, shiftStart })));
  const info = useShiftStartInfo(guardId);
  const [readiness, recheck] = useReadiness();

  const fix = (item: ReadinessItem) => {
    if (readiness === null) return;
    fixReadiness(item, readiness).then(recheck, (error: unknown) => __DEV__ && console.warn(`Fixing ${item} failed`, error));
  };

  const goOn = () => {
    useSession.setState({ shiftStart: null });
    router.replace('/home');
  };

  const time = (at: string) => (info === null ? '' : localTimeOf(parseTimestamp(at), info.timezone));
  const handover = shiftStart?.handover ?? null;
  const day = info?.day ?? null;

  const rowText = (row: ReadinessRow) => {
    const text = ROW_TEXT[row.item];
    if (row.ok) return { label: t(text.ok) };
    // Without NFC hardware there is nothing to switch on.
    const detail = row.item === 'nfc' && !row.fixable ? t('shiftStart.nfcMissing') : t(text.detail);
    return { label: t(text.label), detail, actionLabel: row.fixable ? t('shiftStart.fix') : undefined };
  };

  return (
    <View style={[styles.screen, { backgroundColor: color.bg }]}>
      <ScreenHeader onBack={() => useSession.setState({ activeUser: null, shiftStart: null })} backLabel={t('shiftStart.logout')} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: space.l, paddingBottom: insets.bottom + space.xxl, gap: space.m }]}>
        <View style={{ gap: space.xs, paddingHorizontal: space.xs }}>
          <Text style={[typography.title1, { color: color.text }]} accessibilityRole="header">
            {t('shiftStart.hello', { name: info?.guard_name ?? '' })}
          </Text>
          <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('shiftStart.onDuty')}</Text>
        </View>

        {day === null ? (
          <InfoBanner variant="info" text={t('shiftStart.noRounds')} />
        ) : (
          <Card>
            <ShiftRow label={t('shiftStart.shift')} value={t('shiftStart.shiftTimes', { from: time(day.first_at), to: time(day.last_at) })} large />
            {day.routes.map((route) => (
              <View key={route.route_id} style={{ gap: space.m }}>
                <ShiftRow label={t('shiftStart.route')} value={t('shiftStart.routeValue', { name: route.name, count: route.checkpoints })} />
                <ShiftRow label={t('shiftStart.rounds')} value={roundsLine(route.rounds, route.schedules)} />
              </View>
            ))}
          </Card>
        )}

        {handover !== null && <InfoBanner variant="info" text={t('shiftStart.handover', { name: handover.guard_name, time: time(handover.at) })} />}

        <Text style={[typography.label, { color: color.text2, paddingHorizontal: space.xs, paddingTop: space.s }]} accessibilityRole="header">
          {t('shiftStart.readiness')}
        </Text>
        {readiness !== null && (
          <Card divided>
            {readinessRows(readiness).map((row) => (
              <CheckRow key={row.item} ok={row.ok} {...rowText(row)} onAction={() => fix(row.item)} />
            ))}
          </Card>
        )}

        <View style={[styles.spacer, { minHeight: space.l }]} />
        <Button label={t('shiftStart.start')} onPress={goOn} />
      </ScrollView>
    </View>
  );
}

function ShiftRow({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  const { color, typography, space } = useTheme();
  return (
    <View style={[styles.row, { gap: space.m }]} accessible>
      <Text style={[typography.rowLabel, { color: color.text2 }]}>{label}</Text>
      <Text style={[large ? typography.title2 : typography.body, styles.value, { color: color.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  value: { flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  // On a tall screen the button sits at the bottom.
  spacer: { flexGrow: 1 },
});
