import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { EverySheet, TimeSheet, type TimeTarget } from '@/components/schedule/schedule-sheets';
import { SwitchRow, TimeLimitCard } from '@/components/schedule/time-limit-card';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { SegmentedControl } from '@/components/segmented-control';
import { SheetModal } from '@/components/sheet';
import { showToast } from '@/components/toast';
import {
  ScheduleEditError,
  addStartTime,
  dayOn,
  removeStartTime,
  replaceStartTime,
  setIntervalWindow,
  setScheduleActive,
  setScheduleMode,
  toggleDay,
  type ScheduleEdit,
  type ScheduleMode,
} from '@/domain/schedule-edit';
import { useConfirmLeave } from '@/hooks/use-confirm-leave';
import { useScheduleEdit } from '@/hooks/use-schedule-edit';
import { t } from '@/i18n';
import { everyText, roundsSummary, scheduleEditErrorText } from '@/supervisor/schedule-edit-view';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';
import { formatLocalTime, parseLocalTime } from '@/time/zone';

const MODES: readonly { value: ScheduleMode; label: string }[] = [
  { value: 'list', label: t('schedule.list') },
  { value: 'interval', label: t('schedule.repeat') },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type OpenSheet = { kind: 'time'; target: TimeTarget } | { kind: 'every' };

// The schedule of a route (S8, S-Menetrend; the design's routes/[id]/schedule, decisions: "Menetrend"): the days, the
// start times as a list or a repeating window, the time limit with its suggested value or none, and the schedule on
// or off. One schedule per route on the phone: a route without one gets it at the save. The save is local at once and
// goes through the outbox; on the site phone the alarms are rescheduled right after it.
export default function ScheduleScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const schedule = useScheduleEdit(id);
  const { edit, touched, changed } = schedule;
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useConfirmLeave(touched && changed);

  if (edit === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('supervisor.schedule')} onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('scheduleEdit.missing')} />
        </View>
      </View>
    );
  }

  const change = (next: ScheduleEdit) => {
    setError(null);
    schedule.change(next);
  };
  /** A change that may break a rule of the list (a time twice): the reason is shown, nothing changes. */
  const tryChange = (next: () => ScheduleEdit) => {
    try {
      change(next());
    } catch (e) {
      if (!(e instanceof ScheduleEditError)) throw e;
      setError(scheduleEditErrorText(e));
    }
  };

  const save = () => {
    try {
      schedule.save();
    } catch (e) {
      setError(scheduleEditErrorText(e));
      return;
    }
    showToast(t('scheduleEdit.saved'));
    router.back();
  };

  const { draft } = edit;
  const summary = roundsSummary(draft);

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('supervisor.schedule')} subtitle={edit.base.route.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}>
        {edit.base.schedule_count > 1 && <InfoBanner variant="info" text={t('scheduleEdit.more', { count: edit.base.schedule_count })} />}

        <SectionTitle text={t('schedule.days')} />
        <View style={[styles.row, { gap: space.xs + space.xs / 2 }]}>
          {DAYS.map((day, index) => (
            <DayToggle
              key={day}
              short={t(`schedule.dayShort.${day}`)}
              long={t(`scheduleEdit.day.${day}`)}
              on={dayOn(draft, index)}
              onPress={() => change(toggleDay(edit, index))}
            />
          ))}
        </View>

        <SectionTitle text={t('schedule.startTimes')} />
        <SegmentedControl
          options={MODES}
          value={draft.mode}
          onChange={(mode) => change(setScheduleMode(edit, mode))}
          accessibilityLabel={t('scheduleEdit.modeLabel')}
        />
        <Card divided>
          {draft.mode === 'interval' ? (
            <>
              <ValueRow
                label={t('schedule.first')}
                value={draft.interval_from}
                onPress={() => setSheet({ kind: 'time', target: { kind: 'from' } })}
              />
              <ValueRow
                label={t('schedule.last')}
                value={draft.interval_to}
                onPress={() => setSheet({ kind: 'time', target: { kind: 'to' } })}
              />
              <ValueRow
                label={t('schedule.every')}
                value={everyText(draft.interval_every_min)}
                onPress={() => setSheet({ kind: 'every' })}
              />
            </>
          ) : (
            <View style={[styles.wrap, { padding: space.l, gap: space.s }]}>
              {draft.start_times.map((time) => (
                <TimeChip key={time} time={time} onPress={() => setSheet({ kind: 'time', target: { kind: 'list', time } })} />
              ))}
              <AddChip onPress={() => setSheet({ kind: 'time', target: { kind: 'add' } })} />
            </View>
          )}
          {summary !== null && <SummaryRow text={summary} />}
        </Card>

        <SectionTitle text={t('schedule.timeLimit')} />
        <TimeLimitCard edit={edit} onChange={change} />

        <Card>
          <SwitchRow
            label={t('scheduleEdit.active')}
            hint={t(draft.active ? 'scheduleEdit.activeOn' : 'scheduleEdit.activeOff')}
            value={draft.active}
            onChange={(active) => change(setScheduleActive(edit, active))}
          />
        </Card>

        {error !== null && (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert">
            <InfoBanner variant="error" text={error} />
          </View>
        )}
        <Button label={t('schedule.submit')} disabled={!changed} onPress={save} />
        <Text style={[typography.small, { color: color.text2, textAlign: 'center' }]}>{t('scheduleEdit.footnote')}</Text>
      </ScrollView>

      <SheetModal visible={sheet !== null} onClose={() => setSheet(null)}>
        {sheet?.kind === 'time' && (
          <TimeSheet
            target={sheet.target}
            initial={timeOf(edit, sheet.target)}
            onDone={(time) => {
              const target = sheet.target;
              setSheet(null);
              if (target.kind === 'from') change(setIntervalWindow(edit, { interval_from: time }));
              else if (target.kind === 'to') change(setIntervalWindow(edit, { interval_to: time }));
              else if (target.kind === 'add') tryChange(() => addStartTime(edit, time));
              else tryChange(() => replaceStartTime(edit, target.time, time));
            }}
            onRemove={
              sheet.target.kind === 'list'
                ? () => {
                    const target = sheet.target as { kind: 'list'; time: string };
                    setSheet(null);
                    change(removeStartTime(edit, target.time));
                  }
                : undefined
            }
            onClose={() => setSheet(null)}
          />
        )}
        {sheet?.kind === 'every' && (
          <EverySheet
            value={draft.interval_every_min}
            onPick={(minutes) => {
              setSheet(null);
              change(setIntervalWindow(edit, { interval_every_min: minutes }));
            }}
            onClose={() => setSheet(null)}
          />
        )}
      </SheetModal>
    </View>
  );
}

/** The time a sheet starts from: the field's, the list's, or after the last time of the list (one hour later). */
function timeOf(edit: ScheduleEdit, target: TimeTarget): string {
  const { draft } = edit;
  switch (target.kind) {
    case 'from':
      return draft.interval_from;
    case 'to':
      return draft.interval_to;
    case 'list':
      return target.time;
    case 'add': {
      const last = draft.start_times.at(-1);
      return last === undefined ? draft.interval_from : formatLocalTime((parseLocalTime(last) + 60) % 1440);
    }
  }
}

/** A day capsule (S8): accent when on. */
function DayToggle({ short, long, on, onPress }: { short: string; long: string; on: boolean; onPress: () => void }) {
  const { color, typography, size, radius, border } = useTheme();
  return (
    <Pressable
      accessibilityRole="togglebutton"
      accessibilityLabel={long}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[
        styles.grow,
        styles.centre,
        {
          height: size.touchMin,
          borderRadius: radius.pill,
          borderWidth: border.thin,
          borderColor: on ? color.accent : color.cardBorder,
          backgroundColor: on ? color.accent : color.surface,
        },
      ]}
    >
      <Text style={[typography.label, { color: on ? color.onAccent : color.text2 }]}>{short}</Text>
    </Pressable>
  );
}

/** A row of the window: its name, and its value in a pill that opens the picker. */
function ValueRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { color, typography, space, size, radius } = useTheme();
  return (
    <View style={[styles.row, styles.between, { minHeight: size.field + 2, paddingHorizontal: space.l, gap: space.m }]}>
      <Text style={[typography.body, { color: color.text }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('scheduleEdit.change', { label, value })}
        onPress={onPress}
        style={[
          styles.centre,
          { minHeight: size.touchMin, paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: color.field },
        ]}
      >
        <Text style={[typography.button, tabular, { color: color.text }]}>{value}</Text>
      </Pressable>
    </View>
  );
}

function TimeChip({ time, onPress }: { time: string; onPress: () => void }) {
  const { color, typography, space, size, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('scheduleEdit.timeChip', { time })}
      onPress={onPress}
      style={[
        styles.centre,
        { minHeight: size.touchMin, paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: color.field },
      ]}
    >
      <Text style={[typography.button, tabular, { color: color.text }]}>{time}</Text>
    </Pressable>
  );
}

function AddChip({ onPress }: { onPress: () => void }) {
  const { color, typography, space, size, radius, border, iconSize } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.row,
        {
          minHeight: size.touchMin,
          paddingHorizontal: space.l,
          gap: space.xs,
          borderRadius: radius.pill,
          borderWidth: border.thin,
          borderStyle: 'dashed',
          borderColor: color.dash,
        },
      ]}
    >
      <Icon name="plus" size={iconSize.banner} color={color.accent} />
      <Text style={[typography.buttonSm, { color: color.accent }]}>{t('scheduleEdit.addTime')}</Text>
    </Pressable>
  );
}

/** "13 kör éjszakánként · utolsó 08:00-kor" with a check, in the run colour. */
function SummaryRow({ text }: { text: string }) {
  const { color, typography, space, size, iconSize } = useTheme();
  return (
    <View style={[styles.row, { minHeight: size.touchMin, paddingHorizontal: space.l, gap: space.s }]}>
      <Icon name="check" size={iconSize.dot} color={color.run} />
      <Text style={[typography.rowLabel, tabular, styles.grow, { color: color.run }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
