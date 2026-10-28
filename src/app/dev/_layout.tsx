import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

// Developer tools (development builds only), with a plain native header and back button.
export default function DevLayout() {
  const { color, typography } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.text,
        headerTitleStyle: { fontFamily: typography.title2.fontFamily, fontSize: typography.title2.fontSize },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
