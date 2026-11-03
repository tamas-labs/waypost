import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fixReadiness, getReadiness, type Readiness, type ReadinessItem, type SetupItem } from '@/device/readiness';

/**
 * The readiness of the phone (shift start, device setup), checked again when the app comes back from a system dialog
 * or the settings, and after a fix. Null until the first check.
 */
export function useReadiness(): { readiness: Readiness | null; fix: (item: ReadinessItem | SetupItem) => void } {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const check = useCallback(() => {
    getReadiness().then(setReadiness, (error: unknown) => __DEV__ && console.warn('Checking the readiness failed', error));
  }, []);
  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => subscription.remove();
  }, [check]);
  const fix = (item: ReadinessItem | SetupItem) => {
    if (readiness === null) return;
    fixReadiness(item, readiness).then(check, (error: unknown) => __DEV__ && console.warn(`Fixing ${item} failed`, error));
  };
  return { readiness, fix };
}
