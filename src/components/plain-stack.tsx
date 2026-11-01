import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

import { SyncStatusIndicator } from './sync-status-indicator';

/** The stack of the developer screens: a plain native header and back button, and the sync indicator. */
export function PlainStack() {
  const { color, typography } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.bg },
        headerTintColor: color.text,
        headerTitleStyle: { fontFamily: typography.title2.fontFamily, fontSize: typography.title2.fontSize },
        headerShadowVisible: false,
        headerRight: () => <SyncStatusIndicator />,
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
