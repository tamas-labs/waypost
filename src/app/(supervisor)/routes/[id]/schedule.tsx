import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { Switch } from '@/components/switch';
import { showToast } from '@/components/toast';
import {
  INTERVAL_OPTIONS,
  ScheduleEditError,
  TIME_LIMIT_MAX,
  TIME_LIMIT_MIN,
  addStartTime,
  dayOn,
  removeStartTime,
  replaceStartTime,
  setIntervalWindow,
  setNoLimit,
  setScheduleActive,
  setScheduleMode,
  stepTimeLimit,
  toggleDay,
  type ScheduleEdit,
  type ScheduleMode,
} from '@/domain/schedule-edit';
import { useScheduleEdit } from '@/hooks/use-schedule-edit';
import { t, type TranslationKey } from '@/i18n';
import { everyText, isSuggestedLimit, limitExplanation, roundsSummary, scheduleEditErrorText } from '@/supervisor/schedule-edit-view';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';
import { formatLocalTime, parseLocalTime } from '@/time/zone';

const MODES: readonly { value: ScheduleMode; label: string }[] = [
  { value: 'list', label: t('schedule.list') },
  { value: 'interval', label: t('schedule.repeat') },
];

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
/** Hours and minutes in rows of six. */
const ROW = 6;

/** What the time sheet sets: a field of the window, a new time of the list, or one of its times. */
type TimeTarget = { kind: 'from' } | { kind: 'to' } | { kind: 'add' } | { kind: 'list'; time: string };
type Sheet = { kind: 'time'; target: TimeTarget } | { kind: 'every' };

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
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePreventRemove(touched && changed, ({ repeat }) =>
    Alert.alert(t('routeEdit.leaveTitle'), t('routeEdit.leaveConfirm'), [
      { text: t('routeEdit.leaveKeep'), style: 'cancel' },
      { text: t('routeEdit.leaveDiscard'), style: 'destructive', onPress: repeat },
    ]),
  );

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

      <Modal
        visible={sheet !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSheet(null)}
      >
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
      </Modal>
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

const SHEET_TITLES: Record<TimeTarget['kind'], TranslationKey> = {
  from: 'schedule.first',
  to: 'schedule.last',
  add: 'scheduleEdit.addTime',
  list: 'scheduleEdit.time',
};

function SectionTitle({ text }: { text: string }) {
  const { color, typography, space } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.label, { color: color.text2, paddingHorizontal: space.xs, paddingTop: space.s }]}>
      {text}
    </Text>
  );
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

function RoundButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  const { color, size, radius, iconSize, press } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.centre,
        { width: size.field, height: size.field, borderRadius: radius.round, backgroundColor: color.field },
        disabled && { opacity: press.disabledOpacity },
      ]}
    >
      <Icon name={icon} size={iconSize.button} color={color.text} />
    </Pressable>
  );
}

/** The time limit (S8): −/+ by 5 minutes, the value with "javasolt érték" or "egyéni érték", why, and "Nincs időkorlát". */
function TimeLimitCard({ edit, onChange }: { edit: ScheduleEdit; onChange: (next: ScheduleEdit) => void }) {
  const { color, typography, space, radius, border } = useTheme();
  const limit = edit.draft.time_limit_min;
  const suggested = isSuggestedLimit(edit);
  return (
    <View
      style={{
        padding: space.l + space.xs / 2,
        gap: space.m,
        borderRadius: radius.card,
        backgroundColor: color.surface,
        borderWidth: border.thin,
        borderColor: color.cardBorder,
      }}
    >
      <View style={[styles.row, styles.between, { gap: space.m }]}>
        <RoundButton
          icon="minus"
          label={t('schedule.minus')}
          disabled={limit === null || limit <= TIME_LIMIT_MIN}
          onPress={() => onChange(stepTimeLimit(edit, -1))}
        />
        <View accessible accessibilityLiveRegion="polite" style={[styles.grow, styles.centre]}>
          <Text style={[typography.counterSm, tabular, { color: limit === null ? color.text2 : color.text }]}>
            {limit === null ? t('schedule.noLimit') : t('scheduleEdit.minutes', { minutes: limit })}
          </Text>
          {limit !== null && (
            <Text style={[typography.small, { color: suggested ? color.ok : color.text2 }]}>
              {t(suggested ? 'schedule.suggested' : 'schedule.custom')}
            </Text>
          )}
        </View>
        <RoundButton
          icon="plus"
          label={t('schedule.plus')}
          disabled={limit === null || limit >= TIME_LIMIT_MAX}
          onPress={() => onChange(stepTimeLimit(edit, 1))}
        />
      </View>
      <Text style={[typography.banner, { color: color.text2, textAlign: 'center' }]}>{limitExplanation(edit)}</Text>
      <View style={{ borderTopWidth: border.thin, borderTopColor: color.line, paddingTop: space.m }}>
        <SwitchRow label={t('schedule.noLimit')} value={limit === null} onChange={(none) => onChange(setNoLimit(edit, none))} bare />
      </View>
    </View>
  );
}

function SwitchRow({
  label,
  hint,
  value,
  onChange,
  bare = false,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  bare?: boolean;
}) {
  const { color, typography, space, size } = useTheme();
  return (
    <View style={[styles.row, styles.between, { minHeight: size.touchMin, gap: space.m }, !bare && { padding: space.l }]}>
      <View style={styles.grow}>
        <Text style={[typography.body, { color: color.text }]}>{label}</Text>
        {hint !== undefined && <Text style={[typography.small, { color: color.text2 }]}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/** The bottom sheet of the pickers: the scrim closes it. */
function SheetFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { color, typography, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.grow}>
      <Pressable
        style={[styles.grow, { backgroundColor: color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }]}>
        <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}>
          <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
            {title}
          </Text>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

/** Choices in rows of six, the chosen one in the accent. */
function ChoiceGrid<T>({
  items,
  selected,
  label,
  onPick,
}: {
  items: readonly T[];
  selected: (item: T) => boolean;
  label: (item: T) => string;
  onPick: (item: T) => void;
}) {
  const { color, typography, space, size, radius } = useTheme();
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += ROW) rows.push(items.slice(i, i + ROW));
  return (
    <View style={{ gap: space.xs + space.xs / 2 }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, { gap: space.xs + space.xs / 2 }]}>
          {row.map((item) => {
            const on = selected(item);
            return (
              <Pressable
                key={label(item)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => onPick(item)}
                style={[
                  styles.grow,
                  styles.centre,
                  { height: size.touchMin, borderRadius: radius.cell, backgroundColor: on ? color.accent : color.surface },
                ]}
              >
                <Text style={[typography.segment, tabular, { color: on ? color.onAccent : color.text }]}>{label(item)}</Text>
              </Pressable>
            );
          })}
          {row.length < ROW && Array.from({ length: ROW - row.length }, (_, i) => <View key={`gap${i}`} style={styles.grow} />)}
        </View>
      ))}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A time: the hour and the minute (by five; a minute between, set on the web, stays until another is chosen). */
function TimeSheet({
  target,
  initial,
  onDone,
  onRemove,
  onClose,
}: {
  target: TimeTarget;
  initial: string;
  onDone: (time: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { color, typography } = useTheme();
  const [minutes, setMinutes] = useState(() => parseLocalTime(initial));
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return (
    <SheetFrame title={t(SHEET_TITLES[target.kind])} onClose={onClose}>
      <Text style={[typography.counter, tabular, { color: color.text, textAlign: 'center' }]}>{formatLocalTime(minutes)}</Text>
      <Text style={[typography.label, { color: color.text2 }]}>{t('scheduleEdit.hour')}</Text>
      <ChoiceGrid items={HOURS} selected={(h) => h === hour} label={pad} onPick={(h) => setMinutes(h * 60 + minute)} />
      <Text style={[typography.label, { color: color.text2 }]}>{t('scheduleEdit.minute')}</Text>
      <ChoiceGrid items={MINUTES} selected={(m) => m === minute} label={pad} onPick={(m) => setMinutes(hour * 60 + m)} />
      <Button label={t('scheduleEdit.done')} onPress={() => onDone(formatLocalTime(minutes))} />
      {onRemove !== undefined && <Button variant="dangerText" label={t('scheduleEdit.removeTime')} onPress={onRemove} />}
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </SheetFrame>
  );
}

/** The frequency of the window; one set on the web outside the choices is among them. */
function EverySheet({ value, onPick, onClose }: { value: number; onPick: (minutes: number) => void; onClose: () => void }) {
  const options = INTERVAL_OPTIONS.includes(value) ? INTERVAL_OPTIONS : [...INTERVAL_OPTIONS, value].sort((a, b) => a - b);
  return (
    <SheetFrame title={t('schedule.every')} onClose={onClose}>
      <ChoiceGrid items={options} selected={(m) => m === value} label={(m) => String(m)} onPick={onPick} />
      <InfoUnit />
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </SheetFrame>
  );
}

function InfoUnit() {
  const { color, typography } = useTheme();
  return <Text style={[typography.small, { color: color.text2, textAlign: 'center' }]}>{t('scheduleEdit.everyUnit')}</Text>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  sheet: { maxHeight: '92%' },
});
