// Training a route (specification: Állapotgépek / Betanítás): a draft that becomes a new route version only when it is
// saved. The supervisor walks the route and scans its tags; an unknown NFC tag becomes a new checkpoint (name,
// instruction, the location of the scan), the tag of a checkpoint already on the site adds that checkpoint. A tag
// belongs to one checkpoint of a site at most: the draft never takes a tag twice, nor one of another checkpoint (the
// server's 409 conflict covers what the phone could not see). The walk is measured on the monotonic clock:
// walk_duration_s = last scan − first scan, walk_time_from_prev_s between two consecutive scans.
// Only NFC makes a new checkpoint: a QR code carries the ID of its checkpoint, so it can only add one that exists
// (decisions: "Betanítás – domain").
import type { CheckpointCreateRequest, RouteCreateRequest, RouteVersionCreateRequest } from '@waypost/schema';

import { locationFields, normalizeTagUid, type LocationFix } from '@/chain/payloads';

import type { TagRead } from './scan';
import type { NewId } from './state';

/** The schema's limits (api/checkpoint-create.request, api/route-create.request, api/route-version-create.request). */
export const CHECKPOINT_NAME_MAX = 255;
export const CHECKPOINT_INSTRUCTION_MAX = 2000;
export const ROUTE_NAME_MAX = 255;
export const ROUTE_POINTS_MAX = 500;

export type OrderMode = 'free' | 'fixed';

/** A moment on the monotonic clock (uptime since boot): a change of the wall clock does not distort the walk. */
export interface TrainingInstant {
  uptime_ms: number;
  boot_id: string;
}

/** A checkpoint of the site, active or not: its tag stays taken on the site while it exists. */
export interface SiteCheckpoint {
  id: string;
  name: string;
  /** Uppercase hex without separators. */
  tag_uid: string | null;
  qr_payload: string | null;
  active: boolean;
}

/** Where a new checkpoint is: the location of its scan (integers, as the API takes them); all null without one. */
export type CheckpointLocation = Pick<CheckpointCreateRequest, 'lat_e7' | 'lng_e7' | 'accuracy_dm'>;

export interface PointDetails {
  name: string;
  /** Empty: no instruction. */
  instruction: string;
}

export type TrainingPoint =
  /** A tag no checkpoint of the site has: a new checkpoint. */
  | {
      kind: 'new';
      checkpoint_id: string;
      tag_uid: string;
      name: string;
      instruction: string | null;
      location: CheckpointLocation;
      scanned: TrainingInstant;
    }
  /** The tag of a checkpoint on the site: the checkpoint as it is (an inactive one is switched on by the save). */
  | { kind: 'existing'; checkpoint_id: string; name: string; active: boolean; scanned: TrainingInstant };

export interface TrainingRoute {
  id: string;
  /** Empty until a new route gets its name. */
  name: string;
  order_mode: OrderMode;
}

export interface TrainingDraft {
  site_id: string;
  /** Who trains: a draft is not taken over by another supervisor (the site phone has several). */
  supervisor_id: string;
  route: TrainingRoute;
  /** The route's order mode before the training; null: a new route, created by the save. */
  saved_order_mode: OrderMode | null;
  started: TrainingInstant;
  /** In the order of the walk. */
  points: TrainingPoint[];
}

/** An unknown NFC tag, waiting for the details of its new checkpoint (S6). */
export interface NewTagScan {
  tag_uid: string;
  location: CheckpointLocation;
  scanned: TrainingInstant;
}

/** The tag of a checkpoint on the site, waiting for the supervisor to add it (S6 offers it). */
export interface ExistingScan {
  checkpoint: SiteCheckpoint;
  scanned: TrainingInstant;
}

export type TrainingRead =
  | { kind: 'new_tag'; scan: NewTagScan }
  | { kind: 'existing_checkpoint'; scan: ExistingScan }
  /** The checkpoint is in the draft already, at this position (1-based). */
  | { kind: 'in_draft'; position: number; name: string }
  /** A QR code of no checkpoint on the site: only an NFC tag makes a new one. */
  | { kind: 'unknown_qr' }
  /** The NFC tag gave no valid UID. */
  | { kind: 'unreadable' };

export type TrainingErrorCode =
  'name_required' | 'route_name_required' | 'in_draft' | 'not_in_draft' | 'not_new' | 'no_points' | 'too_many_points' | 'tag_taken';

/** A training rule cannot be applied; code tells the screen what to show. */
export class TrainingError extends Error {
  override name = 'TrainingError';
  constructor(
    readonly code: TrainingErrorCode,
    message: string,
    /** tag_taken: the new points whose tag another checkpoint of the site has by now. */
    readonly checkpointIds: readonly string[] = [],
  ) {
    super(message);
  }
}

export function startTraining(input: {
  site_id: string;
  supervisor_id: string;
  route: TrainingRoute;
  /** Null for a new route. */
  saved_order_mode: OrderMode | null;
  started: TrainingInstant;
}): TrainingDraft {
  return { ...input, route: { ...input.route }, points: [] };
}

/** The draft's point of a tag, by the tag of a new point or the checkpoint an existing tag belongs to. */
function positionInDraft(draft: TrainingDraft, matches: (point: TrainingPoint) => boolean): TrainingRead | null {
  const index = draft.points.findIndex(matches);
  const point = draft.points[index];
  return point === undefined ? null : { kind: 'in_draft', position: index + 1, name: point.name };
}

/**
 * What a scanned tag means for the draft. location: the fix at the scan (a mocked one is not a checkpoint's place);
 * scanned: the monotonic time of the scan, from which the walk times are measured.
 */
export function readTrainingTag(
  draft: TrainingDraft,
  checkpoints: readonly SiteCheckpoint[],
  read: TagRead,
  scanned: TrainingInstant,
  location: LocationFix | null,
): TrainingRead {
  if (read.method === 'qr') {
    const checkpoint = checkpoints.find((c) => c.qr_payload === read.qr_payload);
    if (checkpoint === undefined) return { kind: 'unknown_qr' };
    return (
      positionInDraft(draft, (p) => p.checkpoint_id === checkpoint.id) ?? { kind: 'existing_checkpoint', scan: { checkpoint, scanned } }
    );
  }
  const uid = normalizeTagUid(read.tag_uid);
  if (uid === null) return { kind: 'unreadable' };
  const checkpoint = checkpoints.find((c) => c.tag_uid === uid);
  if (checkpoint !== undefined) {
    return (
      positionInDraft(draft, (p) => p.checkpoint_id === checkpoint.id) ?? { kind: 'existing_checkpoint', scan: { checkpoint, scanned } }
    );
  }
  const fix = location === null || location.mocked ? null : location;
  return (
    positionInDraft(draft, (p) => p.kind === 'new' && p.tag_uid === uid) ?? {
      kind: 'new_tag',
      scan: { tag_uid: uid, location: locationFields(fix), scanned },
    }
  );
}

/** The details trimmed; an empty instruction is none. */
function cleanDetails(details: PointDetails): { name: string; instruction: string | null } {
  const name = details.name.trim();
  if (name === '') throw new TrainingError('name_required', 'A checkpoint needs a name');
  const instruction = details.instruction.trim();
  return {
    name: name.slice(0, CHECKPOINT_NAME_MAX),
    instruction: instruction === '' ? null : instruction.slice(0, CHECKPOINT_INSTRUCTION_MAX),
  };
}

/** The details of a checkpoint are required before it is added (S6); null: nothing to fix. */
export function checkPointDetails(details: PointDetails): { name: 'missing' } | null {
  return details.name.trim() === '' ? { name: 'missing' } : null;
}

function inDraft(draft: TrainingDraft, checkpointId: string): boolean {
  return draft.points.some((point) => point.checkpoint_id === checkpointId);
}

/** Adds the new checkpoint of an unknown tag ("Mentés, jöhet a következő"). */
export function addNewPoint(draft: TrainingDraft, scan: NewTagScan, details: PointDetails, newId: NewId): TrainingDraft {
  if (draft.points.some((point) => point.kind === 'new' && point.tag_uid === scan.tag_uid)) {
    throw new TrainingError('in_draft', 'The tag is in the draft already');
  }
  const cleaned = cleanDetails(details);
  const point: TrainingPoint = {
    kind: 'new',
    checkpoint_id: newId(),
    tag_uid: scan.tag_uid,
    ...cleaned,
    location: scan.location,
    scanned: scan.scanned,
  };
  return { ...draft, points: [...draft.points, point] };
}

/** Adds a checkpoint of the site whose tag was scanned. */
export function addExistingPoint(draft: TrainingDraft, { checkpoint, scanned }: ExistingScan): TrainingDraft {
  if (inDraft(draft, checkpoint.id)) throw new TrainingError('in_draft', 'The checkpoint is in the draft already');
  const point: TrainingPoint = {
    kind: 'existing',
    checkpoint_id: checkpoint.id,
    name: checkpoint.name,
    active: checkpoint.active,
    scanned,
  };
  return { ...draft, points: [...draft.points, point] };
}

/** Changes the details of a new point; an existing checkpoint is changed by editing the route (M5-15). */
export function updatePoint(draft: TrainingDraft, checkpointId: string, details: PointDetails): TrainingDraft {
  const point = draft.points.find((p) => p.checkpoint_id === checkpointId);
  if (point === undefined) throw new TrainingError('not_in_draft', 'The checkpoint is not in the draft');
  if (point.kind !== 'new') throw new TrainingError('not_new', 'Only a new checkpoint is changed in the training');
  const cleaned = cleanDetails(details);
  return { ...draft, points: draft.points.map((p) => (p === point ? { ...point, ...cleaned } : p)) };
}

/** Takes a point out of the draft; the walk times are measured between the points that remain. */
export function removePoint(draft: TrainingDraft, checkpointId: string): TrainingDraft {
  if (!inDraft(draft, checkpointId)) throw new TrainingError('not_in_draft', 'The checkpoint is not in the draft');
  return { ...draft, points: draft.points.filter((point) => point.checkpoint_id !== checkpointId) };
}

export function setOrderMode(draft: TrainingDraft, order_mode: OrderMode): TrainingDraft {
  return { ...draft, route: { ...draft.route, order_mode } };
}

/** The name of a new route; an existing one is renamed by editing the route. */
export function setRouteName(draft: TrainingDraft, name: string): TrainingDraft {
  return { ...draft, route: { ...draft.route, name: name.slice(0, ROUTE_NAME_MAX) } };
}

/** Whole seconds from a to b; null across a reboot, where the uptime starts again. */
export function secondsBetween(a: TrainingInstant, b: TrainingInstant): number | null {
  if (a.boot_id !== b.boot_id) return null;
  return Math.max(0, Math.round((b.uptime_ms - a.uptime_ms) / 1000));
}

/** walk_time_from_prev_s of each point in order: null at the first one. */
export function walkTimes(draft: TrainingDraft): (number | null)[] {
  return draft.points.map((point, index) => {
    const previous = draft.points[index - 1];
    return previous === undefined ? null : secondsBetween(previous.scanned, point.scanned);
  });
}

/** walk_duration_s: last scan − first scan; null without points or across a reboot. */
export function walkDuration(draft: TrainingDraft): number | null {
  const first = draft.points[0];
  const last = draft.points.at(-1);
  return first === undefined || last === undefined ? null : secondsBetween(first.scanned, last.scanned);
}

/** Milliseconds since the training started (the screen's counter); null across a reboot. */
export function elapsedMs(draft: TrainingDraft, now: TrainingInstant): number | null {
  return draft.started.boot_id === now.boot_id ? Math.max(0, now.uptime_ms - draft.started.uptime_ms) : null;
}

/** The new points whose tag another checkpoint of the site has (e.g. a pull brought one since the scan). */
export function takenTags(draft: TrainingDraft, checkpoints: readonly SiteCheckpoint[]): string[] {
  return draft.points.flatMap((point) =>
    point.kind === 'new' && checkpoints.some((c) => c.tag_uid === point.tag_uid && c.id !== point.checkpoint_id)
      ? [point.checkpoint_id]
      : [],
  );
}

/** What the save sends, in this order: the route (new, or its order mode changed), the checkpoints, the version. */
export interface TrainingSave {
  createRoute: (RouteCreateRequest & { id: string }) | null;
  updateRoute: { id: string; order_mode: OrderMode } | null;
  createCheckpoints: (CheckpointCreateRequest & { id: string; tag_uid: string })[];
  /** Inactive checkpoints of the draft, switched on: a guard's scan finds only active ones outside a round. */
  activateCheckpoints: string[];
  createVersion: RouteVersionCreateRequest & { id: string; walk_duration_s: number | null };
}

/**
 * The calls that turn the draft into a new route version. Checks again that no checkpoint of the site (as the phone
 * knows them now) has the tag of a new point. Throws TrainingError when the draft cannot be saved.
 */
export function trainingSave(draft: TrainingDraft, checkpoints: readonly SiteCheckpoint[], newId: NewId): TrainingSave {
  const [first, ...rest] = draft.points;
  if (first === undefined) throw new TrainingError('no_points', 'The training has no checkpoint');
  if (draft.points.length > ROUTE_POINTS_MAX)
    throw new TrainingError('too_many_points', `A route has at most ${ROUTE_POINTS_MAX} checkpoints`);
  const name = draft.route.name.trim();
  if (draft.saved_order_mode === null && name === '') throw new TrainingError('route_name_required', 'The new route needs a name');
  const taken = takenTags(draft, checkpoints);
  if (taken.length > 0) throw new TrainingError('tag_taken', 'Another checkpoint of the site has the tag', taken);

  const { route, site_id } = draft;
  const times = walkTimes(draft);
  return {
    createRoute: draft.saved_order_mode === null ? { id: route.id, site_id, name, order_mode: route.order_mode, active: true } : null,
    updateRoute:
      draft.saved_order_mode !== null && draft.saved_order_mode !== route.order_mode
        ? { id: route.id, order_mode: route.order_mode }
        : null,
    createCheckpoints: draft.points.flatMap((point) =>
      point.kind === 'new'
        ? [
            {
              id: point.checkpoint_id,
              site_id,
              name: point.name,
              instruction: point.instruction,
              tag_type: 'nfc' as const,
              tag_uid: point.tag_uid,
              ...point.location,
              active: true,
            },
          ]
        : [],
    ),
    activateCheckpoints: draft.points.flatMap((point) => (point.kind === 'existing' && !point.active ? [point.checkpoint_id] : [])),
    createVersion: {
      id: newId(),
      walk_duration_s: walkDuration(draft),
      checkpoints: [
        { checkpoint_id: first.checkpoint_id, walk_time_from_prev_s: null },
        ...rest.map((point, index) => ({ checkpoint_id: point.checkpoint_id, walk_time_from_prev_s: times[index + 1] ?? null })),
      ],
    },
  };
}
