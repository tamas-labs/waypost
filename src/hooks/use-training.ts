// What the training screens (S5, its QR reader, S6) share: the supervisor's draft, loaded again whenever a screen comes on
// top (the point screen changes it), and the way from a tag read to the point screen.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { getDatabase } from '@/db/open';
import type { TagRead } from '@/domain/scan';
import type { TrainingDraft, TrainingInstant, TrainingRead } from '@/domain/training';
import { playFeedback, type FeedbackKind } from '@/feedback/feedback';
import { t } from '@/i18n';
import { currentLocation } from '@/location/location';
import { supervisorAccount } from '@/supervisor/sites';
import { loadTrainingDraft, pendingScanOf, pendingScanParam, readForTraining, storeTrainingDraft } from '@/supervisor/training';
import { readClock } from '@/time/clock';

/** Now on the monotonic clock, which the training measures on. */
export function trainingNow(): TrainingInstant {
  const { uptime_ms, boot_id } = readClock();
  return { uptime_ms, boot_id };
}

/** The supervisor of the session: on the site phone the one who logged in with the PIN, on their own phone the account. */
export function useSupervisorId(): string | null {
  const session = useSession(useShallow(({ mode, activeUser }) => ({ mode, activeUser })));
  return useMemo(() => supervisorAccount(getDatabase(), session)?.id ?? null, [session]);
}

function loadDraft(supervisorId: string | null, routeId: string): TrainingDraft | null {
  if (supervisorId === null) return null;
  const draft = loadTrainingDraft(getDatabase(), supervisorId);
  return draft?.route.id === routeId ? draft : null;
}

export interface TrainingDraftState {
  /** Null: no draft of this route for the supervisor (saved, discarded, or another supervisor's). */
  draft: TrainingDraft | null;
  /** Stores a changed draft and shows it. */
  change: (next: TrainingDraft) => void;
}

export function useTrainingDraft(routeId: string): TrainingDraftState {
  const supervisorId = useSupervisorId();
  const [draft, setDraft] = useState(() => loadDraft(supervisorId, routeId));
  useFocusEffect(useCallback(() => setDraft(loadDraft(supervisorId, routeId)), [supervisorId, routeId]));
  const change = useCallback((next: TrainingDraft) => {
    storeTrainingDraft(getDatabase(), next);
    setDraft(next);
  }, []);
  return { draft, change };
}

export interface TrainingMessage {
  variant: 'error' | 'warn';
  text: string;
}

function feedbackOf(outcome: TrainingRead): FeedbackKind {
  if (outcome.kind === 'new_tag' || outcome.kind === 'existing_checkpoint') return 'success';
  return outcome.kind === 'in_draft' || outcome.kind === 'point_added' ? 'warning' : 'error';
}

function messageOf(outcome: TrainingRead): TrainingMessage | null {
  switch (outcome.kind) {
    case 'in_draft':
      return { variant: 'warn', text: t('training.inDraft', { name: outcome.name, position: outcome.position }) };
    case 'point_added':
      return { variant: 'warn', text: t('training.pointAdded', { name: outcome.name }) };
    case 'unknown_qr':
      return { variant: 'error', text: t('training.unknownQr') };
    case 'unreadable':
      return { variant: 'error', text: t('training.unreadable') };
    default:
      return null;
  }
}

export interface TrainingReader {
  /** A read of the training; null: a tag that gave no UID. */
  handle: (read: TagRead | null) => Promise<void>;
  /** A new tag waits for its location (at most 5 s): another read is dropped meanwhile. */
  locating: boolean;
  /** What the last read came to, if it does not go on to the point screen. */
  message: TrainingMessage | null;
}

/**
 * A read goes on to the point screen if it brings a point (a new tag, a checkpoint of the site): push from the training
 * screen, replace from the QR reader over it. The feedback comes at once; only a new tag waits for its location.
 */
export function useTrainingReader(routeId: string, navigate: 'push' | 'replace'): TrainingReader {
  const supervisorId = useSupervisorId();
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<TrainingMessage | null>(null);
  const busy = useRef(false);

  const handle = useCallback(
    async (read: TagRead | null) => {
      if (busy.current) return;
      if (read === null) {
        playFeedback('error');
        setMessage({ variant: 'error', text: t('training.unreadable') });
        return;
      }
      const db = getDatabase();
      const draft = loadDraft(supervisorId, routeId);
      if (draft === null) return;
      const scanned = trainingNow();
      let outcome = readForTraining(db, draft, read, scanned, null);
      playFeedback(feedbackOf(outcome));
      if (outcome.kind === 'new_tag') {
        busy.current = true;
        setLocating(true);
        try {
          outcome = readForTraining(db, draft, read, scanned, await currentLocation());
        } finally {
          busy.current = false;
          setLocating(false);
        }
      }
      const pending = pendingScanOf(outcome, read.method);
      setMessage(messageOf(outcome));
      if (pending !== null)
        router[navigate]({ pathname: '/routes/[id]/train/point', params: { id: routeId, scan: pendingScanParam(pending) } });
    },
    [supervisorId, routeId, navigate],
  );
  return { handle, locating, message };
}
