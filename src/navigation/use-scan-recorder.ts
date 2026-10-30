import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDatabase } from '@/db/open';
import type { PointOutcome, ScanOutcome, TagRead } from '@/domain/scan';
import { playFeedback } from '@/feedback/feedback';
import { recordTagRead, scanFeedback } from '@/guard/scan';

/** The params of the result screen for a known checkpoint (a tag read or a manual entry). */
export function pointResultParams(outcome: PointOutcome): Record<string, string> {
  if (outcome.kind === 'already_scanned') return { kind: outcome.kind, checkpoint_id: outcome.checkpoint_id, round_id: outcome.round_id, scanned_at: outcome.scanned_at };
  return { kind: outcome.kind, scan_id: outcome.scan_id, checkpoint_id: outcome.checkpoint_id, ...(outcome.round_id === null ? {} : { round_id: outcome.round_id }), out_of_order: String(outcome.out_of_order), completed: String(outcome.completed) };
}

/** The params of the result screen. An unknown tag has no round of its own: it belongs to the round the guard was on. */
export function scanResultParams(outcome: ScanOutcome, read: TagRead, roundId: string): Record<string, string> {
  if (outcome.kind !== 'unknown_tag') return pointResultParams(outcome);
  return { kind: outcome.kind, method: read.method, read_id: read.method === 'nfc' ? read.tag_uid : read.qr_payload, round_id: roundId };
}

export interface ScanRecorder {
  /** Records a read and goes on to its result; a read while another is recorded is dropped (the same tag touched twice). */
  record: (read: TagRead) => Promise<void>;
  recording: boolean;
  failed: boolean;
}

/** The way from a tag read to the result screen (G7–G9), for the round's screen (push) and the QR reader over it (replace). */
export function useScanRecorder(navigate: 'push' | 'replace', roundId: string): ScanRecorder {
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
        router[navigate]({ pathname: '/scan-result', params: scanResultParams(outcome, read, roundId) });
      } catch (error) {
        if (__DEV__) console.warn('Recording a scan failed', error);
        playFeedback('error');
        setFailed(true);
      } finally {
        busy.current = false;
        setRecording(false);
      }
    },
    [navigate, roundId],
  );
  return { record, recording, failed };
}
