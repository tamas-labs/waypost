// The time limit of the schedule screen (S8), and its switch rows.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Switch } from '@/components/switch';
import { TIME_LIMIT_MAX, TIME_LIMIT_MIN, setNoLimit, stepTimeLimit, type ScheduleEdit } from '@/domain/schedule-edit';
import { t } from '@/i18n';
import { isSuggestedLimit, limitExplanation } from '@/supervisor/schedule-edit-view';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

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
export function TimeLimitCard({ edit, onChange }: { edit: ScheduleEdit; onChange: (next: ScheduleEdit) => void }) {
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

export function SwitchRow({
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { justifyContent: 'space-between' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
