import { Stack } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { useTheme } from '@/theme/theme-provider';

import { routeAccess } from './access';

/**
 * The root navigator: the route groups of the specification ((auth), (guard), (supervisor)), each open only in the
 * matching session. When the session changes, a screen that is no longer allowed is left for the index route,
 * which redirects to the session's start screen.
 */
export function AppStack() {
  const { color } = useTheme();
  const access = useSession(useShallow(routeAccess));
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={access.login || access.pin}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={access.guard}>
        <Stack.Screen name="(guard)" />
      </Stack.Protected>
      <Stack.Protected guard={access.supervisor}>
        <Stack.Screen name="(supervisor)" />
      </Stack.Protected>
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="dev" />
        <Stack.Screen name="prototype" />
      </Stack.Protected>
    </Stack>
  );
}
