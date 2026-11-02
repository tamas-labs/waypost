import { Pressable, StyleSheet, Text } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { Icon } from './icon';

/** The first letters of the first two words of a name, in capitals ("Kovács Anna" → "KA"); empty for an empty name. */
export function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toLocaleUpperCase('hu');
}

export interface AccountButtonProps {
  /** Null if not known: a person icon instead of the monogram. */
  name: string | null;
  onPress: () => void;
}

/** The account at the top right of the site list (DESIGN_HANDOFF S2): a 44 dp accent circle with the monogram. */
export function AccountButton({ name, onPress }: AccountButtonProps) {
  const { color, typography, size, press, iconSize } = useTheme();
  const letters = name === null ? '' : monogram(name);
  // 44 dp as the design draws it; the slop gives the 48 dp touch area.
  const slop = Math.max(0, (size.touchMin - size.avatar) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name === null ? t('supervisor.accountUnknown') : t('supervisor.account', { name })}
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => [
        styles.button,
        { width: size.avatar, height: size.avatar, borderRadius: size.avatar / 2, backgroundColor: color.accent },
        pressed && { opacity: press.opacity, transform: [{ scale: press.scale }] },
      ]}
    >
      {letters === '' ? (
        <Icon name="person" size={iconSize.button} color={color.onAccent} />
      ) : (
        <Text style={[typography.monogram, { color: color.onAccent }]}>{letters}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
