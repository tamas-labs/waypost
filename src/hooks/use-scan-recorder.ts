import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { getDatabase } from '@/db/open';
import { logError } from '@/diagnostics/error-log';
import type { PointOutcome, ScanOutcome, TagRead } from '@/domain/scan';
import { playFeedback } from '@/feedback/feedback';
import { previewTagRead, recordTagRead, scanFeedback } from '@/guard/scan';

/** The params of the result screen for a known checkpoint (a tag read or a manual entry). */
export function pointResultParams(outcome: PointOutcome): Record<string, string> {
  if (outcome.kind === 'already_scanned')
    return { kind: outcome.kind, checkpoint_id: outcome.checkpoint_id, round_id: outcome.round_id, scanned_at: outcome.scanned_at };
  return {
    kind: outcome.kind,
    scan_id: outcome.scan_id,
    checkpoint_id: outcome.checkpoint_id,
    ...(outcome.round_id === null ? {} : { round_id: outcome.round_id }),
    out_of_order: String(outcome.out_of_order),
    completed: String(outcome.completed),
  };
}

/** The params of the result screen. An unknown tag has no round of its own: it belongs to the round the guard was on. */
export function scanResultParams(outcome: ScanOutcome, read: TagRead, roundId: string): Record<string, string> {
  if (outcome.kind !== 'unknown_tag') return pointResultParams(outcome);
  return { kind: outcome.kind, method: read.method, read_id: read.method === 'nfc' ? read.tag_uid : read.qr_payload, round_id: roundId };
}

export interface ScanRecorder {
  /**
   * Records a read and goes on to its result. A read while others are recorded is recorded after them (another tag
   * touched soon after), unless it is the same tag again; the result screen is that of the last one.
   */
  record: (read: TagRead) => Promise<void>;
  recording: boolean;
  failed: boolean;
}

/** The same tag or code: touched twice, it is one read. */
const readKey = (read: TagRead) => (read.method === 'nfc' ? `nfc:${read.tag_uid}` : `qr:${read.qr_payload}`);

/** The way from a tag read to the result screen (G7–G9), for the round's screen (push) and the QR reader over it (replace). */
export function useScanRecorder(navigate: 'push' | 'replace', roundId: string): ScanRecorder {
  const [recording, setRecording] = useState(false);
  const [failed, setFailed] = useState(false);
  // The reads being recorded, by readKey, in the order of the touches.
  const pending = useRef(new Set<string>());

  const record = useCallback(
    async (read: TagRead) => {
      const key = readKey(read);
      if (pending.current.has(key)) return;
      const first = pending.current.size === 0;
      pending.current.add(key);
      setRecording(true);
      setFailed(false);
      try {
        // The first read is told at once; one behind others when it is decided, as those may change it (the order).
        const previewed = first ? scanFeedback(previewTagRead(getDatabase(), read)) : null;
        if (previewed !== null) playFeedback(previewed);
        const outcome = await recordTagRead(getDatabase(), read);
        // An entry written before it (a read, a round closed by the scheduler) may have changed what it comes to.
        if (scanFeedback(outcome) !== previewed) playFeedback(scanFeedback(outcome));
        pending.current.delete(key);
        if (pending.current.size === 0) router[navigate]({ pathname: '/scan-result', params: scanResultParams(outcome, read, roundId) });
      } catch (error) {
        pending.current.delete(key);
        if (__DEV__) console.warn('Recording a scan failed', error);
        logError('scan', error, read.method);
        playFeedback('error');
        setFailed(true);
      } finally {
        if (pending.current.size === 0) setRecording(false);
      }
    },
    [navigate, roundId],
  );
  return { record, recording, failed };
}
