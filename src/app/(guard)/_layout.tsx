import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

// The guard mode screens; the root navigator opens this group only in a matching session.
export default function GuardLayout() {
  const { color } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      {/* Only its buttons leave the alarm screen. */}
      <Stack.Screen name="alarm" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
