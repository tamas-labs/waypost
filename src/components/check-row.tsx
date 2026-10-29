import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { Button } from './button';
import { Icon } from './icon';

export interface CheckRowProps {
  label: string;
  ok: boolean;
  /** Below the label when not ok: what the missing setting causes ("Késhet az ébresztés"). */
  detail?: string;
  /** The fix of a row that is not ok ("Javítás"), e.g. opening the system setting. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * A row of a readiness checklist (B-Muszakkezdes, device setup): a 30 dp status circle – check on okBg, or an
 * exclamation on warnBg –, the label, and when not ok the detail and a tonal fix button. A row of a divided Card.
 */
export function CheckRow({ label, ok, detail, actionLabel, onAction }: CheckRowProps) {
  const { color, typography, space, size, iconSize, iconStroke } = useTheme();
  const showDetail = !ok && detail !== undefined;
  const showAction = !ok && actionLabel !== undefined && onAction !== undefined;
  return (
    <View style={[styles.row, { minHeight: size.listItem, paddingLeft: space.l, paddingRight: showAction ? space.m : space.l, gap: space.m }]}>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.circle, { width: size.checkCircle, height: size.checkCircle, borderRadius: size.checkCircle / 2, backgroundColor: color[ok ? 'okBg' : 'warnBg'] }]}
      >
        <Icon name={ok ? 'check' : 'exclam'} size={iconSize.dot} color={color[ok ? 'ok' : 'warn']} strokeWidth={iconStroke.bold} />
      </View>
      {/* Label and detail are read as one: "Akkumulátorkímélés, Késhet az ébresztés". */}
      <View accessible style={[styles.texts, { paddingVertical: space.s }]}>
        <Text style={[typography.body, { color: color.text }]}>{label}</Text>
        {showDetail && <Text style={[typography.small, { color: color.warn }]}>{detail}</Text>}
      </View>
      {showAction && <Button variant="warnTonal" label={actionLabel} accessibilityHint={label} onPress={onAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
});
