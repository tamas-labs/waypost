import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { Icon } from './icon';

export const PIN_LENGTH = 6;

export interface PinDotsProps {
  /** Digits entered so far. */
  entered: number;
  length?: number;
  /** Changing it shakes the dots once: a wrong PIN (DESIGN_HANDOFF 5.16). 0 = never shaken. */
  shakeKey?: number;
}

/** The entered digits as dots in a capsule card: filled accent, empty line. */
export function PinDots({ entered, length = PIN_LENGTH, shakeKey = 0 }: PinDotsProps) {
  const { color, size, space, radius, border, motion } = useTheme();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (shakeKey === 0) return;
    const step = (to: number) => withTiming(to, { duration: motion.shakeStepMs });
    offset.value = withSequence(
      step(-motion.shakeOffset),
      withRepeat(withSequence(step(motion.shakeOffset), step(-motion.shakeOffset)), motion.shakeRepeats - 1),
      step(motion.shakeOffset),
      step(0),
    );
  }, [shakeKey, offset, motion]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <Animated.View
      accessible
      accessibilityLabel={t('pin.enteredOf', { n: entered, total: length })}
      style={[
        styles.dots,
        {
          gap: space.m,
          paddingVertical: space.l,
          paddingHorizontal: space.xxl,
          borderRadius: radius.card,
          backgroundColor: color.surface,
          borderWidth: border.thin,
          borderColor: color.cardBorder,
        },
        shake,
      ]}
    >
      {Array.from({ length }, (_, index) => (
        <View
          // The dots are positions: the index is their identity.
          key={index}
          style={{ width: size.pinDot, height: size.pinDot, borderRadius: size.pinDot / 2, backgroundColor: index < entered ? color.accent : color.line }}
        />
      ))}
    </Animated.View>
  );
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export interface PinPadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** The shield key at the bottom left (supervisor login); without it the place stays empty. */
  onSupervisor?: () => void;
  /** While the PIN is locked or being checked. */
  disabled?: boolean;
}

/** The 3 × 4 PIN keypad (DESIGN_HANDOFF 5.16): 80 dp round digit keys; supervisor and delete in the bottom corners. */
export function PinPad({ onDigit, onDelete, onSupervisor, disabled = false }: PinPadProps) {
  const { color, typography, size, space, border, iconSize, press } = useTheme();
  const key = { width: size.pinKey, height: size.pinKey, borderRadius: size.pinKey / 2 };

  const digitKey = (digit: string) => (
    <Pressable
      key={digit}
      accessibilityRole="button"
      accessibilityLabel={digit}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onDigit(digit)}
      style={({ pressed }) => [
        styles.key,
        key,
        { backgroundColor: color.surface, borderWidth: border.thin, borderColor: color.cardBorder },
        pressed && { opacity: press.opacity, transform: [{ scale: press.scale }] },
        disabled && { opacity: press.disabledOpacity },
      ]}
    >
      <Text style={[typography.pinKey, { color: color.text }]}>{digit}</Text>
    </Pressable>
  );

  return (
    // Three keys a row.
    <View style={[styles.grid, { rowGap: space.m, columnGap: space.xxl, maxWidth: 3 * size.pinKey + 2 * space.xxl }]}>
      {DIGITS.map(digitKey)}
      {onSupervisor === undefined ? (
        <View style={key} />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pin.supervisorMode')}
          onPress={onSupervisor}
          style={({ pressed }) => [styles.key, key, pressed && { opacity: press.opacity }]}
        >
          <Icon name="shield" size={iconSize.large} color={color.text2} />
        </Pressable>
      )}
      {digitKey('0')}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('pin.delete')}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onDelete}
        style={({ pressed }) => [styles.key, key, pressed && { opacity: press.opacity }, disabled && { opacity: press.disabledOpacity }]}
      >
        <Icon name="delete" size={iconSize.large} color={color.text2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center' },
  key: { alignItems: 'center', justifyContent: 'center' },
});
