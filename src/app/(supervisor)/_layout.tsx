import { Stack } from 'expo-router';

import { ToastHost } from '@/components/toast';
import { useRejectedCallsToast } from '@/hooks/use-rejected-calls-toast';
import { useTheme } from '@/theme/theme-provider';

// The supervisor mode screens; the root navigator opens this group only in a matching session.
export default function SupervisorLayout() {
  const { color } = useTheme();
  useRejectedCallsToast();
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
      <ToastHost />
    </>
  );
}
