import { Text } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

/** The small heading above a group of a screen (DESIGN_HANDOFF 5), e.g. "Engedélyek és beállítások". */
export function SectionTitle({ text }: { text: string }) {
  const { color, typography, space } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.label, { color: color.text2, paddingHorizontal: space.xs, paddingTop: space.s }]}>
      {text}
    </Text>
  );
}
