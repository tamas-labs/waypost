import { useEffect, useState } from 'react';

import { onChainEntries } from '@/chain/events';
import { onConfigurationPulled, onOutboxQueued } from '@/sync/events';

/**
 * What a screen shows from the database: loaded at once, and again after a chain entry, a pull and a supervisor action
 * (outbox), and every refreshMs if given. The load function must be stable (useCallback): its change loads again and
 * starts the listeners over (a dependency of it changed, e.g. the refused calls).
 */
export function useLiveQuery<T>(load: () => T, refreshMs?: number): T {
  const [state, setState] = useState(() => ({ load, value: load() }));
  let current = state;
  if (state.load !== load) {
    // A new load function: loaded during the render, not in an effect (no render with the old value).
    current = { load, value: load() };
    setState(current);
  }
  useEffect(() => {
    const reload = () => setState({ load, value: load() });
    const stops = [onConfigurationPulled(reload), onChainEntries(reload), onOutboxQueued(reload)];
    const interval = refreshMs === undefined ? null : setInterval(reload, refreshMs);
    return () => {
      stops.forEach((stop) => stop());
      if (interval !== null) clearInterval(interval);
    };
  }, [load, refreshMs]);
  return current.value;
}
