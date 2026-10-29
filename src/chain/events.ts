// What the chain writer tells the other modules after a write has been committed: the round alarms (M3-24) are
// rebuilt when a shift starts or closes and when a round starts or closes.
import type { ChainEntry } from '@waypost/schema';

export type ChainEntriesListener = (entries: readonly ChainEntry[]) => void;

const listeners = new Set<ChainEntriesListener>();

/** Called with the entries of every committed write, in seq order. Returns the unsubscribe function. */
export function onChainEntries(listener: ChainEntriesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls every listener; one that throws does not stop the others (the entries are written either way). */
export function emitChainEntries(entries: readonly ChainEntry[]): void {
  for (const listener of [...listeners]) {
    try {
      listener(entries);
    } catch (error) {
      console.error('A chain-entries listener failed', error);
    }
  }
}
