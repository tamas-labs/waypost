import { Stack } from 'expo-router';

import { useTheme } from '@/theme/theme-provider';

// The supervisor mode screens; the root navigator opens this group only in a matching session.
export default function SupervisorLayout() {
  const { color } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />;
}
