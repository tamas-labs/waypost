import { useEffect, useState } from 'react';

import type { Coordinate } from './coordinate';
import { watchPosition } from './location';

/** The phone's position while `active`, for showing it on a map; the last one stays after that. Null: none yet. */
export function usePosition(active: boolean): Coordinate | null {
  const [position, setPosition] = useState<Coordinate | null>(null);
  useEffect(() => {
    if (active) return watchPosition(setPosition);
  }, [active]);
  return position;
}
