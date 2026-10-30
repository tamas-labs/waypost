import type { Timestamp } from '@waypost/schema';
import { useCallback, useEffect, useState } from 'react';

import { getDatabase } from '@/db/open';
import { parseTimestamp } from '@/time/timestamp';

import { trustedNowMs } from './home';
import { requestSchedulerStep } from './scheduler';

/**
 * The seconds until target at the trusted time, updated every second. Key the component by the target, so it starts
 * over with a new one. At zero a scheduler step comes at once: the round opens or closes now, not at the next step.
 */
export function useCountdown(target: Timestamp): number {
  const read = useCallback(() => Math.max(0, Math.ceil((parseTimestamp(target) - trustedNowMs(getDatabase())) / 1000)), [target]);
  const [seconds, setSeconds] = useState(read);
  useEffect(() => {
    const interval = setInterval(() => setSeconds(read()), 1000);
    return () => clearInterval(interval);
  }, [read]);

  const due = seconds === 0;
  useEffect(() => {
    if (due) requestSchedulerStep('round_due');
  }, [due]);
  return seconds;
}
