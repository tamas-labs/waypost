// The pickers of the schedule screen (S8): a time by its hour and minute, and the frequency of the window.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { INTERVAL_OPTIONS } from '@/domain/schedule-edit';
import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';
import { formatLocalTime, parseLocalTime } from '@/time/zone';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
/** Hours and minutes in rows of six. */
const ROW = 6;

/** What the time sheet sets: a field of the window, a new time of the list, or one of its times. */
export type TimeTarget = { kind: 'from' } | { kind: 'to' } | { kind: 'add' } | { kind: 'list'; time: string };

const SHEET_TITLES: Record<TimeTarget['kind'], TranslationKey> = {
  from: 'schedule.first',
  to: 'schedule.last',
  add: 'scheduleEdit.addTime',
  list: 'scheduleEdit.time',
};

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
export function TimeSheet({
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
    <Sheet title={t(SHEET_TITLES[target.kind])} onClose={onClose}>
      <Text style={[typography.counter, tabular, { color: color.text, textAlign: 'center' }]}>{formatLocalTime(minutes)}</Text>
      <Text style={[typography.label, { color: color.text2 }]}>{t('scheduleEdit.hour')}</Text>
      <ChoiceGrid items={HOURS} selected={(h) => h === hour} label={pad} onPick={(h) => setMinutes(h * 60 + minute)} />
      <Text style={[typography.label, { color: color.text2 }]}>{t('scheduleEdit.minute')}</Text>
      <ChoiceGrid items={MINUTES} selected={(m) => m === minute} label={pad} onPick={(m) => setMinutes(hour * 60 + m)} />
      <Button label={t('scheduleEdit.done')} onPress={() => onDone(formatLocalTime(minutes))} />
      {onRemove !== undefined && <Button variant="dangerText" label={t('scheduleEdit.removeTime')} onPress={onRemove} />}
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}

/** The frequency of the window; one set on the web outside the choices is among them. */
export function EverySheet({ value, onPick, onClose }: { value: number; onPick: (minutes: number) => void; onClose: () => void }) {
  const options = INTERVAL_OPTIONS.includes(value) ? INTERVAL_OPTIONS : [...INTERVAL_OPTIONS, value].sort((a, b) => a - b);
  return (
    <Sheet title={t('schedule.every')} onClose={onClose}>
      <ChoiceGrid items={options} selected={(m) => m === value} label={(m) => String(m)} onPick={onPick} />
      <InfoUnit />
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}

function InfoUnit() {
  const { color, typography } = useTheme();
  return <Text style={[typography.small, { color: color.text2, textAlign: 'center' }]}>{t('scheduleEdit.everyUnit')}</Text>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
