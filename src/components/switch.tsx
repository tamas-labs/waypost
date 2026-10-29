import { Switch as NativeSwitch } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Required: the name of the setting, read with the on / off state. */
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

/** The platform switch in the theme's colours (DESIGN_HANDOFF 5.11): on → accent track, off → track, white knob. */
export function Switch({ value, onValueChange, accessibilityLabel, disabled = false, testID }: SwitchProps) {
  const { color } = useTheme();
  return (
    <NativeSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      trackColor={{ false: color.track, true: color.accent }}
      thumbColor={color.knob}
      ios_backgroundColor={color.track}
      testID={testID}
    />
  );
}
