// The schedule of a route while its screen is open (S8): the route and its schedule from the database, and the draft
// made from it (in memory: it is short). A draft the supervisor has not touched follows the database; a touched one is
// saved against what the database has when it is saved.
import { useCallback, useState } from 'react';

import { getDatabase } from '@/db/open';
import { beginScheduleEdit, scheduleEditChanged, type ScheduleEdit, type ScheduleEditBase } from '@/domain/schedule-edit';
import { loadScheduleEditBase, saveScheduleEdit } from '@/supervisor/schedule-edit';

import { useLiveQuery } from './use-live-query';

export interface ScheduleEditState {
  /** null: the route is not on the phone. */
  edit: ScheduleEdit | null;
  /** The supervisor has changed something (a new schedule only once they touch it). */
  touched: boolean;
  /** There is something to save: a new schedule, or a change of the saved one. */
  changed: boolean;
  change: (next: ScheduleEdit) => void;
  /** Saves (supervisor/schedule-edit.ts); throws ScheduleEditError. */
  save: () => void;
}

const baseKey = (base: ScheduleEditBase | null) => JSON.stringify(base);

export function useScheduleEdit(routeId: string): ScheduleEditState {
  const load = useCallback(() => loadScheduleEditBase(getDatabase(), routeId), [routeId]);
  const base = useLiveQuery(load);
  const [edit, setEdit] = useState(() => (base === null ? null : beginScheduleEdit(base)));
  const [touched, setTouched] = useState(false);
  // A new load (a pull, the save), during the render: an untouched draft starts over from it, a touched one is kept
  // but compared with it – a schedule that arrived meanwhile is changed by the save, not created a second time.
  const key = baseKey(base);
  const [loaded, setLoaded] = useState(key);
  if (key !== loaded) {
    setLoaded(key);
    if (base === null) setEdit(null);
    else if (!touched || edit === null) setEdit(beginScheduleEdit(base));
    else setEdit({ base, draft: edit.draft });
  }

  const change = useCallback((next: ScheduleEdit) => {
    setTouched(true);
    setEdit(next);
  }, []);

  const save = useCallback(() => {
    if (edit === null) throw new Error('No route to save the schedule of');
    saveScheduleEdit(getDatabase(), edit);
    setTouched(false);
  }, [edit]);

  return { edit, touched, changed: edit !== null && scheduleEditChanged(edit), change, save };
}
