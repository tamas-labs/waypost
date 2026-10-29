// What the sync tells the other modules. The alarm schedule (M3-24) is rebuilt after a pull that changed the
// configuration (specification, Szinkron protokoll / Pull: after a schedule change the alarms are rescheduled).
import type { PullSummary } from './pull';

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
