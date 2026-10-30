import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDatabase } from '@/db/open';
import type { ScanOutcome, TagRead } from '@/domain/scan';
import { playFeedback } from '@/feedback/feedback';
import { recordTagRead, scanFeedback } from '@/guard/scan';

function resultParams(outcome: ScanOutcome): Record<string, string> {
  switch (outcome.kind) {
    case 'unknown_tag':
      return { kind: outcome.kind };
    case 'already_scanned':
      return { kind: outcome.kind, checkpoint_id: outcome.checkpoint_id, round_id: outcome.round_id, scanned_at: outcome.scanned_at };
    case 'recorded':
      return { kind: outcome.kind, checkpoint_id: outcome.checkpoint_id, ...(outcome.round_id === null ? {} : { round_id: outcome.round_id }), out_of_order: String(outcome.out_of_order), completed: String(outcome.completed) };
  }
}

export interface ScanRecorder {
  /** Records a read and goes on to its result; a read while another is recorded is dropped (the same tag touched twice). */
  record: (read: TagRead) => Promise<void>;
  recording: boolean;
  failed: boolean;
}

/** The way from a tag read to the result screen (G7–G9), for the round's screen (push) and the QR reader over it (replace). */
export function useScanRecorder(navigate: 'push' | 'replace'): ScanRecorder {
  const [recording, setRecording] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const record = useCallback(
    async (read: TagRead) => {
      if (busy.current) return;
      busy.current = true;
      setRecording(true);
      setFailed(false);
      try {
        const outcome = await recordTagRead(getDatabase(), read);
        playFeedback(scanFeedback(outcome));
        router[navigate]({ pathname: '/scan-result', params: resultParams(outcome) });
      } catch (error) {
        if (__DEV__) console.warn('Recording a scan failed', error);
        playFeedback('error');
        setFailed(true);
      } finally {
        busy.current = false;
        setRecording(false);
      }
    },
    [navigate],
  );
  return { record, recording, failed };
}
