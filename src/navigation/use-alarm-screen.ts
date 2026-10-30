import { router } from 'expo-router';
import { useEffect } from 'react';

import { clearAllAlarms, useActiveAlarms } from '@/alarms/active-alarms';
import { useSession } from '@/auth/session';

import { routeAccess } from './access';

/** Opens the alarm screen (G4) over whatever a logged-in guard is doing; a logout ends the alarms. */
export function useAlarmScreen(): void {
  const guard = useSession((session) => routeAccess(session).guard);
  const alarm = useActiveAlarms(({ alarms }) => alarms[0] ?? null);
  useEffect(() => {
    if (alarm === null) return;
    if (guard) router.push({ pathname: '/alarm', params: { ...alarm } });
    else clearAllAlarms();
  }, [alarm, guard]);
}
