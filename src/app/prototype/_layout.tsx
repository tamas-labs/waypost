import { Stack } from 'expo-router';

import { SyncStatusIndicator } from '@/components/sync-status-indicator';

import { useTheme } from '@/theme/theme-provider';

// Device test screens of the M1 prototype, with a plain native header and back button, and the sync indicator.
export default function PrototypeLayout() {
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
