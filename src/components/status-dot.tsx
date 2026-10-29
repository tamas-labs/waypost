import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { statusStyle } from '@/theme/tokens';

import { Icon } from './icon';

export type StatusKey = keyof typeof statusStyle;

export type StatusDotProps =
  | {
      status: StatusKey;
      /** A missing point in a highlighted row: filled with the status colour, the icon in the background colour. */
      filled?: boolean;
    }
  | {
      /** Numbered variant (training, fixed order): the position of the point. */
      number: number;
    };

/**
 * The 32 dp circle at the left of a list item (DESIGN_HANDOFF 5.4). Decorative: the row's text and label carry the
 * status (DESIGN_HANDOFF 2.3).
 */
export function StatusDot(props: StatusDotProps) {
  const { color, typography, size, iconSize, iconStroke, border } = useTheme();
  const circle = { width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2 };

  if ('number' in props) {
    return (
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.dot, circle, { backgroundColor: color.runBg }]}>
        <Text style={[typography.label, styles.number, { color: color.run }]}>{props.number}</Text>
      </View>
    );
  }

  const style = statusStyle[props.status];
  if (style.icon === 'ring') {
    return (
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.dot, circle, { borderWidth: border.ring, borderColor: color[style.fg] }]}
      />
    );
  }
  const filled = props.filled === true;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.dot, circle, { backgroundColor: filled ? color[style.fg] : color[style.bg] }]}
    >
      <Icon name={style.icon} size={iconSize.dot} color={filled ? color.bg : color[style.fg]} strokeWidth={iconStroke.bold} />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { alignItems: 'center', justifyContent: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
