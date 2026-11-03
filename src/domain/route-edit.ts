// Editing a route without walking it (specification: Állapotgépek / Betanítás; S7): the names, instructions and photos
// of its checkpoints, their order, taking points out, the route's name and order mode. Every save is a new route
// version, made from the current one: the measured walk times are inherited by the points that remain, and where the
// order changed, walk_time_from_prev_s is null. A new point or a new tag needs a scan on the spot: the editing has no
// way to add a checkpoint or change a tag, that is a training (domain/training.ts). The changes of a checkpoint are its
// own (the other routes with it see them too); a point taken out stays a checkpoint of the site (decisions:
// "Útvonalverzió bejárás nélkül").
import type { CheckpointUpdateRequest, RouteUpdateRequest, RouteVersionCreateRequest } from '@waypost/schema';

import type { PhotoFile } from '@/chain/payloads';

import type { NewId } from './state';
import { ROUTE_NAME_MAX, trimPointText, type OrderMode } from './training';

/** A checkpoint of the version being edited, at its position. */
export interface VersionPoint {
  checkpoint_id: string;
  name: string;
  instruction: string | null;
  photo_media_id: string | null;
  /** Null at the first position, or where it was not measured. */
  walk_time_from_prev_s: number | null;
}

/** The route and its current version, as the editing started from them. */
export interface RouteEditBase {
  route: { id: string; name: string; order_mode: OrderMode };
  version_id: string;
  version: number;
  walk_duration_s: number | null;
  /** By position. */
  points: VersionPoint[];
}

/** The photo of an edited point: the checkpoint's own (saved), one taken now (new, uploaded by the save), or none. */
export type EditPhoto = { kind: 'saved'; media_id: string } | { kind: 'new'; photo: PhotoFile } | null;

export interface EditPoint {
  checkpoint_id: string;
  name: string;
  instruction: string | null;
  photo: EditPhoto;
}

export interface RouteEdit {
  base: RouteEditBase;
  name: string;
  order_mode: OrderMode;
  /** In the new order. */
  points: EditPoint[];
}

/** What the point sheet changes (S7 → name, instruction, photo). */
export interface EditPointDetails {
  name: string;
  /** Empty: no instruction. */
  instruction: string;
  photo: EditPhoto;
}

export type RouteEditErrorCode =
  | 'name_required'
  | 'route_name_required'
  | 'not_in_route'
  | 'not_reorder'
  | 'no_points'
  | 'unchanged'
  /** The route has another current version by now (a pull brought it, or a training saved it): the editing starts again. */
  | 'stale';

/** A rule of the editing cannot be applied; code tells the screen what to show. */
export class RouteEditError extends Error {
  override name = 'RouteEditError';
  constructor(
    readonly code: RouteEditErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const savedPhoto = (mediaId: string | null): EditPhoto => (mediaId === null ? null : { kind: 'saved', media_id: mediaId });

/** The photo_media_id an edited photo means. */
const photoMediaId = (photo: EditPhoto): string | null =>
  photo === null ? null : photo.kind === 'saved' ? photo.media_id : photo.photo.id;

export function beginRouteEdit(base: RouteEditBase): RouteEdit {
  return {
    base,
    name: base.route.name,
    order_mode: base.route.order_mode,
    points: base.points.map((point) => ({
      checkpoint_id: point.checkpoint_id,
      name: point.name,
      instruction: point.instruction,
      photo: savedPhoto(point.photo_media_id),
    })),
  };
}

function pointOf(edit: RouteEdit, checkpointId: string): EditPoint {
  const point = edit.points.find((p) => p.checkpoint_id === checkpointId);
  if (point === undefined) throw new RouteEditError('not_in_route', 'The checkpoint is not on the route');
  return point;
}

/** The details of a point as its sheet shows them. */
export function editPointDetails(edit: RouteEdit, checkpointId: string): EditPointDetails {
  const point = pointOf(edit, checkpointId);
  return { name: point.name, instruction: point.instruction ?? '', photo: point.photo };
}

export function updateEditPoint(edit: RouteEdit, checkpointId: string, details: EditPointDetails): RouteEdit {
  const point = pointOf(edit, checkpointId);
  const text = trimPointText(details);
  if (text.name === '') throw new RouteEditError('name_required', 'A checkpoint needs a name');
  return { ...edit, points: edit.points.map((p) => (p === point ? { ...point, ...text, photo: details.photo } : p)) };
}

/** The points in a new order (the list after a drag): the same points, each once. */
export function reorderEditPoints(edit: RouteEdit, order: readonly string[]): RouteEdit {
  const byId = new Map(edit.points.map((point) => [point.checkpoint_id, point]));
  const points = order.flatMap((id) => {
    const point = byId.get(id);
    byId.delete(id);
    return point === undefined ? [] : [point];
  });
  if (points.length !== edit.points.length || order.length !== points.length) {
    throw new RouteEditError('not_reorder', 'A new order has the same points, each once');
  }
  return { ...edit, points };
}

/** Takes a point out of the route; its checkpoint stays on the site. */
export function removeEditPoint(edit: RouteEdit, checkpointId: string): RouteEdit {
  const point = pointOf(edit, checkpointId);
  return { ...edit, points: edit.points.filter((p) => p !== point) };
}

export function setEditRouteName(edit: RouteEdit, name: string): RouteEdit {
  return { ...edit, name: name.slice(0, ROUTE_NAME_MAX) };
}

export function setEditOrderMode(edit: RouteEdit, order_mode: OrderMode): RouteEdit {
  return { ...edit, order_mode };
}

/** The photos taken during the editing: their files go with the save, or are deleted when the editing is left. */
export function editPhotos(edit: RouteEdit): PhotoFile[] {
  return edit.points.flatMap((point) => (point.photo?.kind === 'new' ? [point.photo.photo] : []));
}

/**
 * walk_time_from_prev_s of each point in the new order. A point keeps its time from the point before it if that one
 * came before it in the version too, with only removed points between them: then it is the sum of the times through
 * them (the walk passed there), null if one of them was not measured. Otherwise the order changed: null.
 */
export function inheritedWalkTimes(base: RouteEditBase, order: readonly string[]): (number | null)[] {
  const position = new Map(base.points.map((point, index) => [point.checkpoint_id, index]));
  const kept = new Set(order);
  return order.map((id, index) => {
    const previous = order[index - 1];
    const from = previous === undefined ? undefined : position.get(previous);
    const to = position.get(id);
    if (from === undefined || to === undefined || from >= to) return null;
    let sum = 0;
    for (let k = from + 1; k <= to; k += 1) {
      const point = base.points[k];
      if (point === undefined || (k < to && kept.has(point.checkpoint_id))) return null;
      if (point.walk_time_from_prev_s === null) return null;
      sum += point.walk_time_from_prev_s;
    }
    return sum;
  });
}

/**
 * walk_duration_s of the new version: the measured walk, less the walk to the removed first points and from the
 * removed last ones while the order stayed. After a change of the order, or if those times were not measured, the
 * measured walk stays as it is: the same place walked, at most as long (the suggested time limit comes from it).
 */
export function inheritedWalkDuration(base: RouteEditBase, order: readonly string[]): number | null {
  if (base.walk_duration_s === null) return null;
  const positions = order.map((id) => base.points.findIndex((point) => point.checkpoint_id === id));
  const first = positions[0];
  const last = positions.at(-1);
  if (first === undefined || last === undefined || positions.some((p, i) => p < 0 || (i > 0 && p <= (positions[i - 1] ?? -1)))) {
    return base.walk_duration_s;
  }
  let removed = 0;
  for (const [k, point] of base.points.entries()) {
    if ((k > 0 && k <= first) || k > last) {
      if (point.walk_time_from_prev_s === null) return base.walk_duration_s;
      removed += point.walk_time_from_prev_s;
    }
  }
  return Math.max(0, base.walk_duration_s - removed);
}

/** The changed properties of a checkpoint; null if nothing changed. */
function checkpointChanges(before: VersionPoint | undefined, point: EditPoint): CheckpointUpdateRequest | null {
  if (before === undefined) return null;
  const body: CheckpointUpdateRequest = {
    ...(point.name !== before.name ? { name: point.name } : {}),
    ...(point.instruction !== before.instruction ? { instruction: point.instruction } : {}),
    ...(photoMediaId(point.photo) !== before.photo_media_id ? { photo_media_id: photoMediaId(point.photo) } : {}),
  };
  return Object.keys(body).length === 0 ? null : body;
}

function routeChanges(edit: RouteEdit): RouteUpdateRequest | null {
  const name = edit.name.trim();
  const body: RouteUpdateRequest = {
    ...(name !== edit.base.route.name ? { name } : {}),
    ...(edit.order_mode !== edit.base.route.order_mode ? { order_mode: edit.order_mode } : {}),
  };
  return Object.keys(body).length === 0 ? null : body;
}

/** Whether the save would change anything (S7 saves only then). */
export function routeEditChanged(edit: RouteEdit): boolean {
  const { base } = edit;
  const before = new Map(base.points.map((point) => [point.checkpoint_id, point]));
  return (
    routeChanges(edit) !== null ||
    edit.points.length !== base.points.length ||
    edit.points.some((point, index) => point.checkpoint_id !== base.points[index]?.checkpoint_id) ||
    edit.points.some((point) => checkpointChanges(before.get(point.checkpoint_id), point) !== null)
  );
}

/** What the save sends, in this order: the photos taken, the changed checkpoints, the route, the version. */
export interface RouteEditSave {
  /** Uploaded before the checkpoint calls that refer to them (photo_media_id), with the checkpoint as their owner. */
  uploadPhotos: { checkpoint_id: string; photo: PhotoFile }[];
  updateCheckpoints: { id: string; body: CheckpointUpdateRequest }[];
  updateRoute: RouteUpdateRequest | null;
  createVersion: RouteVersionCreateRequest & { id: string; walk_duration_s: number | null };
}

/** The calls that make the edited route its new version. Throws RouteEditError when it cannot be saved. */
export function routeEditSave(edit: RouteEdit, newId: NewId): RouteEditSave {
  const [first, ...rest] = edit.points;
  if (first === undefined) throw new RouteEditError('no_points', 'A route needs a checkpoint');
  if (edit.name.trim() === '') throw new RouteEditError('route_name_required', 'A route needs a name');
  if (!routeEditChanged(edit)) throw new RouteEditError('unchanged', 'Nothing changed');

  const before = new Map(edit.base.points.map((point) => [point.checkpoint_id, point]));
  const order = edit.points.map((point) => point.checkpoint_id);
  const times = inheritedWalkTimes(edit.base, order);
  return {
    uploadPhotos: edit.points.flatMap((point) =>
      point.photo?.kind === 'new' && point.photo.photo.id !== before.get(point.checkpoint_id)?.photo_media_id
        ? [{ checkpoint_id: point.checkpoint_id, photo: point.photo.photo }]
        : [],
    ),
    updateCheckpoints: edit.points.flatMap((point) => {
      const body = checkpointChanges(before.get(point.checkpoint_id), point);
      return body === null ? [] : [{ id: point.checkpoint_id, body }];
    }),
    updateRoute: routeChanges(edit),
    createVersion: {
      id: newId(),
      walk_duration_s: inheritedWalkDuration(edit.base, order),
      checkpoints: [
        { checkpoint_id: first.checkpoint_id, walk_time_from_prev_s: null },
        ...rest.map((point, index) => ({ checkpoint_id: point.checkpoint_id, walk_time_from_prev_s: times[index + 1] ?? null })),
      ],
    },
  };
}
