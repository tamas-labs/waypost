import { Stack } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { routeAccess } from '@/navigation/access';
import { useTheme } from '@/theme/theme-provider';

// Login screens: the supervisor login on a phone that is not enrolled, the PIN login on the site phone.
export default function AuthLayout() {
  const { color } = useTheme();
  const access = useSession(useShallow(routeAccess));
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Protected guard={access.login}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={access.pin}>
        <Stack.Screen name="pin" />
      </Stack.Protected>
    </Stack>
  );
}
