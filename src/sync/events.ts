// What the sync tells the other modules. The alarm schedule (M3-24) is rebuilt after a pull that changed the
// configuration (specification, Szinkron protokoll / Pull: after a schedule change the alarms are rescheduled).
import type { SyncPullResponse, Timestamp } from '@waypost/schema';

/** What a pull changed in the local configuration. */
export interface PullSummary {
  pages: number;
  /** A page started a full state: the local configuration was replaced. */
  reset: boolean;
  /** Upserted records per list of "changes". */
  changed: Record<keyof SyncPullResponse['changes'], number>;
  /** Deleted IDs per list of "deleted". */
  deleted: Record<keyof SyncPullResponse['deleted'], number>;
  server_time: Timestamp;
}

export type ConfigurationPulledListener = (summary: PullSummary) => void;

const listeners = new Set<ConfigurationPulledListener>();

/** Called after a pull that changed the local configuration has been committed. Returns the unsubscribe function. */
export function onConfigurationPulled(listener: ConfigurationPulledListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls every listener; one that throws does not stop the others (the pull is committed either way). */
export function emitConfigurationPulled(summary: PullSummary): void {
  for (const listener of [...listeners]) {
    try {
      listener(summary);
    } catch (error) {
      console.error('A configuration-pulled listener failed', error);
    }
  }
}

type OutboxQueuedListener = () => void;

const queuedListeners = new Set<OutboxQueuedListener>();

/** Called after a supervisor action's calls have been queued (the sync counts them and starts soon; the screens reload). */
export function onOutboxQueued(listener: OutboxQueuedListener): () => void {
  queuedListeners.add(listener);
  return () => queuedListeners.delete(listener);
}

/** Calls every listener; one that throws does not stop the others (the action is committed either way). */
export function emitOutboxQueued(): void {
  for (const listener of [...queuedListeners]) {
    try {
      listener();
    } catch (error) {
      console.error('An outbox listener failed', error);
    }
  }
}
