import { useEffect, useState } from 'react';

import { onChainEntries } from '@/chain/events';
import { onConfigurationPulled, onOutboxQueued } from '@/sync/events';

/**
 * What a screen shows from the database: loaded at once, and again after a chain entry, a pull and a supervisor action
 * (outbox), and every refreshMs if given. The load function must be stable (useCallback): its change starts the listeners over.
 */
export function useLiveQuery<T>(load: () => T, refreshMs?: number): T {
  const [value, setValue] = useState(load);
  useEffect(() => {
    const reload = () => setValue(load());
    const stops = [onConfigurationPulled(reload), onChainEntries(reload), onOutboxQueued(reload)];
    const interval = refreshMs === undefined ? null : setInterval(reload, refreshMs);
    return () => {
      stops.forEach((stop) => stop());
      if (interval !== null) clearInterval(interval);
    };
  }, [load, refreshMs]);
  return value;
}
