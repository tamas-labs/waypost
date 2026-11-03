// The editing of a route (S7) while its screen is open: the route's current version from the database, the editing
// made from it (kept in memory: it is short, unlike a walk), and the files of the photos taken meanwhile, which live as
// long as the editing unless it is saved with them.
import { useCallback, useEffect, useRef, useState } from 'react';

import { getDatabase } from '@/db/open';
import { beginRouteEdit, editPhotos, routeEditChanged, type RouteEdit, type RouteEditBase } from '@/domain/route-edit';
import { loadRouteEditBase, saveRouteEdit } from '@/supervisor/route-edit';
import { deleteDraftPhotos } from '@/supervisor/training';

import { useLiveQuery } from './use-live-query';

export interface RouteEditState {
  /** The route's current version on the phone; null: no route, or no version yet. */
  base: RouteEditBase | null;
  edit: RouteEdit | null;
  changed: boolean;
  /** The route has another current version than the one the editing started from (a pull brought it). */
  stale: boolean;
  /** Shows the changed editing; the files of the photos it no longer has are deleted. */
  change: (next: RouteEdit) => void;
  /** Starts again from the current version; the photos taken are deleted. */
  restart: () => void;
  /** Saves the editing as the route's new version (supervisor/route-edit.ts); throws RouteEditError. */
  save: (supervisorId: string) => string;
}

const droppedPhotos = (before: RouteEdit | null, after: RouteEdit | null) => {
  const kept = new Set(after === null ? [] : editPhotos(after).map((photo) => photo.id));
  return before === null ? [] : editPhotos(before).filter((photo) => !kept.has(photo.id));
};

export function useRouteEdit(routeId: string): RouteEditState {
  const load = useCallback(() => loadRouteEditBase(getDatabase(), routeId), [routeId]);
  const base = useLiveQuery(load);
  const [edit, setEdit] = useState(() => (base === null ? null : beginRouteEdit(base)));
  const state = useRef({ edit });

  const show = useCallback((next: RouteEdit | null) => {
    const dropped = droppedPhotos(state.current.edit, next);
    state.current.edit = next;
    setEdit(next);
    deleteDraftPhotos(dropped);
  }, []);

  // A new current version (a point added on the spot, a pull): an editing without changes starts from it.
  useEffect(() => {
    const current = state.current.edit;
    if (base === null) return;
    if (current === null || (current.base.version_id !== base.version_id && !routeEditChanged(current))) show(beginRouteEdit(base));
  }, [base, show]);

  useEffect(() => {
    const current = state.current;
    return () => {
      if (current.edit !== null) deleteDraftPhotos(editPhotos(current.edit));
    };
  }, []);

  const change = useCallback((next: RouteEdit) => show(next), [show]);
  const restart = useCallback(() => show(base === null ? null : beginRouteEdit(base)), [base, show]);
  const save = useCallback((supervisorId: string) => {
    const current = state.current.edit;
    if (current === null) throw new Error('No route to save');
    const versionId = saveRouteEdit(getDatabase(), current, supervisorId);
    // Its photos are device data now; the next editing starts from the new version, which the reload brings.
    state.current.edit = null;
    setEdit(null);
    return versionId;
  }, []);

  return {
    base,
    edit,
    changed: edit !== null && routeEditChanged(edit),
    stale: base !== null && edit !== null && edit.base.version_id !== base.version_id,
    change,
    restart,
    save,
  };
}
