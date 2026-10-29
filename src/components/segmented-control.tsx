import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The name of the choice, for screen readers (e.g. "Nézet"). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Capsule of equal options, the active one filled with the accent (DESIGN_HANDOFF 5.10): Lista / Térkép, Szabad / Kötött. */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel, style }: SegmentedControlProps<T>) {
  const { color, typography, radius, size, border, fontFamily } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        {
          padding: size.segmentPadding,
          gap: size.segmentPadding,
          borderRadius: radius.pill,
          backgroundColor: color.surface,
          borderColor: color.cardBorder,
          borderWidth: border.thin,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            // 40 dp option + the 4 dp padding around it = the 48 dp touch minimum.
            hitSlop={size.segmentPadding}
            onPress={() => {
              if (!active) onChange(option.value);
            }}
            style={[styles.option, { minHeight: size.segmentOption, borderRadius: radius.pill }, active && { backgroundColor: color.accent }]}
          >
            <Text style={[typography.segment, active ? { color: color.onAccent } : { color: color.text2, fontFamily: fontFamily.bold }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row' },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
