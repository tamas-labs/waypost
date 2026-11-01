import { useCallback, useEffect, useRef, useState } from 'react';

import type { LocationFix } from '@/chain/payloads';
import { DomainError } from '@/domain/state';
import { playFeedback } from '@/feedback/feedback';
import { currentLocation } from '@/location/location';

export interface RecordForm {
  /** The location request has come back, with or without a location. */
  located: boolean;
  saving: boolean;
  /** closed: what the form records for has closed meanwhile, so it cannot be saved. */
  problem: 'failed' | 'closed' | null;
  /** The form is still on the screen, e.g. to leave it after saving. */
  isMounted: () => boolean;
  /** Runs the recording once at a time; a second press meanwhile does nothing. If it fails, the form stays with its data. */
  save: (record: () => Promise<void>) => Promise<void>;
}

/**
 * What the forms of a manual entry and of an incident share: asking for the location once they open (onLocation, stable),
 * and saving. closedCode: the domain's error that means the problem "closed".
 */
export function useRecordForm(onLocation: (location: LocationFix) => void, closedCode: DomainError['code']): RecordForm {
  const [located, setLocated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<RecordForm['problem']>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void currentLocation().then((location) => {
      if (!mounted.current) return;
      setLocated(true);
      if (location !== null) onLocation(location);
    });
    return () => {
      mounted.current = false;
    };
  }, [onLocation]);

  const save = useCallback(
    async (record: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setSaving(true);
      setProblem(null);
      try {
        await record();
      } catch (error) {
        if (__DEV__) console.warn('Recording a form failed', error);
        playFeedback('error');
        setProblem(error instanceof DomainError && error.code === closedCode ? 'closed' : 'failed');
      } finally {
        busy.current = false;
        setSaving(false);
      }
    },
    [closedCode],
  );

  return { located, saving, problem, isMounted: useCallback(() => mounted.current, []), save };
}
