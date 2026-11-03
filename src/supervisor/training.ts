// Training a route in supervisor mode (the rules: domain/training.ts): the checkpoints of the site from the local
// database, the draft kept in the kv table until it is saved or discarded (so a restart of the app does not lose the
// walk), and the save, which is one supervisor action: the local records at once, and the calls through the outbox
// (sync/outbox.ts). A call the server refuses (e.g. 409: the tag was taken on another phone meanwhile) is shown to the
// supervisor like any refused action, and the next pull brings the server's state back (decisions: "Betanítás – domain").
// The photos of the new points are files of the draft until the save (photo/files.ts): a photo that leaves the draft
// (its point removed, replaced by another, the draft discarded) is deleted, a saved one becomes the media row that its
// upload call sends before the checkpoint (decisions: "Betanítás – pont adatai").
import type { Timestamp } from '@waypost/schema';
import { and, eq, inArray } from 'drizzle-orm';

import { configCalls, type ConfigCall } from '@/api/config-calls';
import type { LocationFix } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { deleteKv, getKv, setKv } from '@/db/kv';
import { checkpoints, routes } from '@/db/schema';
import type { TagRead } from '@/domain/scan';
import type { NewId } from '@/domain/state';
import {
  draftPhotos,
  readTrainingTag,
  startTraining,
  trainingSave,
  type ExistingScan,
  type NewTagScan,
  type OrderMode,
  type SiteCheckpoint,
  type TrainingDraft,
  type TrainingInstant,
  type TrainingRead,
} from '@/domain/training';
import { uuidv7 } from '@/id/uuidv7';
import { photoFile } from '@/photo/files';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

import { checkpointPhotoCall, insertCheckpointPhoto, insertRouteVersion } from './route-version';

/** A new route starts with free order; the supervisor can switch it during the walk (S5). */
export const NEW_ROUTE_ORDER_MODE: OrderMode = 'free';

/** Every checkpoint of the site, active or not: a tag stays taken on the site while its checkpoint exists. */
export function siteCheckpoints(db: Database, siteId: string): SiteCheckpoint[] {
  return db
    .select({
      id: checkpoints.id,
      name: checkpoints.name,
      tag_uid: checkpoints.tag_uid,
      qr_payload: checkpoints.qr_payload,
      active: checkpoints.active,
    })
    .from(checkpoints)
    .where(eq(checkpoints.site_id, siteId))
    .all();
}

/** The supervisor's training draft, if they have one (another supervisor's on the site phone is not theirs). */
export function loadTrainingDraft(db: Database, supervisorId: string): TrainingDraft | null {
  const draft = getKv(db, 'training.draft');
  return draft?.supervisor_id === supervisorId ? draft : null;
}

/** The draft on the phone, whoever's it is: a new training replaces it (the phone keeps one). */
export function storedTrainingDraft(db: Database): TrainingDraft | null {
  return getKv(db, 'training.draft');
}

/** Deletes the files of photos no draft keeps; a file that will not go is the cleanup's orphan later. */
export function deleteDraftPhotos(photos: readonly { id: string }[]): void {
  for (const { id } of photos) {
    try {
      const file = photoFile(id);
      if (file.exists) file.delete();
    } catch (error) {
      if (__DEV__) console.warn(`Deleting the photo ${id} failed`, error);
    }
  }
}

/** The photos of the stored draft that the next one does not keep. */
function droppedPhotos(db: Database, next: TrainingDraft | null) {
  const before = storedTrainingDraft(db);
  if (before === null) return [];
  const kept = new Set(next === null ? [] : draftPhotos(next).map((photo) => photo.id));
  return draftPhotos(before).filter((photo) => !kept.has(photo.id));
}

/** Stores the draft (replacing the one on the phone); the photos it no longer has are deleted. */
export function storeTrainingDraft(db: Database, draft: TrainingDraft): void {
  const dropped = droppedPhotos(db, draft);
  setKv(db, 'training.draft', draft);
  deleteDraftPhotos(dropped);
}

export function discardTrainingDraft(db: Database): void {
  const dropped = droppedPhotos(db, null);
  deleteKv(db, 'training.draft');
  deleteDraftPhotos(dropped);
}

/**
 * Starts a training and stores its draft (replacing an earlier one): of an existing route (routeId), or of a new route
 * of the site, whose ID is generated here and which is created by the save.
 */
export function beginTraining(
  db: Database,
  input: { siteId: string; routeId: string | null; supervisorId: string; started: TrainingInstant },
): TrainingDraft {
  let draft: TrainingDraft;
  if (input.routeId === null) {
    draft = startTraining({
      site_id: input.siteId,
      supervisor_id: input.supervisorId,
      route: { id: uuidv7(), name: '', order_mode: NEW_ROUTE_ORDER_MODE },
      saved_order_mode: null,
      started: input.started,
    });
  } else {
    const route = db
      .select({ id: routes.id, name: routes.name, order_mode: routes.order_mode })
      .from(routes)
      .where(and(eq(routes.id, input.routeId), eq(routes.site_id, input.siteId)))
      .get();
    if (route === undefined) throw new Error(`Route ${input.routeId} is not on site ${input.siteId}`);
    draft = startTraining({
      site_id: input.siteId,
      supervisor_id: input.supervisorId,
      route,
      saved_order_mode: route.order_mode,
      started: input.started,
    });
  }
  storeTrainingDraft(db, draft);
  return draft;
}

/**
 * A scan waiting on the point screen (S6) for the supervisor's decision: the new checkpoint of an unknown tag, or a
 * checkpoint of the site to add. It travels as a route param, so it is plain JSON.
 */
export type PendingScan =
  { kind: 'new'; scan: NewTagScan } | { kind: 'existing'; checkpoint_id: string; method: TagRead['method']; scanned: TrainingInstant };

/** The pending scan of a read that has one: a new tag or a checkpoint of the site; null for the rest. */
export function pendingScanOf(outcome: TrainingRead, method: TagRead['method']): PendingScan | null {
  if (outcome.kind === 'new_tag') return { kind: 'new', scan: outcome.scan };
  if (outcome.kind === 'existing_checkpoint')
    return { kind: 'existing', checkpoint_id: outcome.scan.checkpoint.id, method, scanned: outcome.scan.scanned };
  return null;
}

export function pendingScanParam(scan: PendingScan): string {
  return JSON.stringify(scan);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isIntOrNull = (value: unknown) => value === null || Number.isInteger(value);
const isInstant = (value: unknown): value is TrainingInstant =>
  isObject(value) && typeof value.uptime_ms === 'number' && typeof value.boot_id === 'string';

/** The pending scan of a route param; null if it is missing or not one (a stale or hand-made link). */
export function parsePendingScan(param: string | undefined): PendingScan | null {
  if (param === undefined) return null;
  let value: unknown;
  try {
    value = JSON.parse(param);
  } catch {
    return null;
  }
  if (!isObject(value)) return null;
  if (value.kind === 'new' && isObject(value.scan)) {
    const { tag_uid, location, scanned } = value.scan;
    if (typeof tag_uid !== 'string' || !isInstant(scanned) || !isObject(location)) return null;
    const { lat_e7, lng_e7, accuracy_dm } = location;
    if (!isIntOrNull(lat_e7) || !isIntOrNull(lng_e7) || !isIntOrNull(accuracy_dm)) return null;
    return {
      kind: 'new',
      scan: {
        tag_uid,
        location: { lat_e7: lat_e7 as number | null, lng_e7: lng_e7 as number | null, accuracy_dm: accuracy_dm as number | null },
        scanned: { uptime_ms: scanned.uptime_ms, boot_id: scanned.boot_id },
      },
    };
  }
  if (value.kind === 'existing') {
    const { checkpoint_id, method, scanned } = value;
    if (typeof checkpoint_id !== 'string' || (method !== 'nfc' && method !== 'qr') || !isInstant(scanned)) return null;
    return { kind: 'existing', checkpoint_id, method, scanned: { uptime_ms: scanned.uptime_ms, boot_id: scanned.boot_id } };
  }
  return null;
}

/** What a read means for the draft, against the site's checkpoints as the phone knows them now. */
export function readForTraining(
  db: Database,
  draft: TrainingDraft,
  read: TagRead,
  scanned: TrainingInstant,
  location: LocationFix | null,
): TrainingRead {
  return readTrainingTag(draft, siteCheckpoints(db, draft.site_id), read, scanned, location);
}

/** The checkpoint of an existing scan, if it is still on the site. */
export function existingScanOf(db: Database, draft: TrainingDraft, pending: PendingScan & { kind: 'existing' }): ExistingScan | null {
  const checkpoint = siteCheckpoints(db, draft.site_id).find((c) => c.id === pending.checkpoint_id);
  return checkpoint === undefined ? null : { checkpoint, scanned: pending.scanned };
}

/**
 * Saves the draft as the route's new version: the route (created, or its order mode changed), the photos and the new checkpoints,
 * the inactive ones of the draft switched on, the version as the route's current one – locally at once and through
 * the outbox in this order; the draft is deleted in the same transaction. Throws TrainingError (domain/training.ts)
 * if the draft cannot be saved: nothing changes then. Returns the ID of the new version.
 */
export function saveTraining(db: Database, draft: TrainingDraft, now: Timestamp = nowTimestamp(), newId: NewId = uuidv7): string {
  const save = trainingSave(draft, siteCheckpoints(db, draft.site_id), newId);
  const { route } = draft;
  if (save.createRoute === null) {
    const exists = db.select({ id: routes.id }).from(routes).where(eq(routes.id, route.id)).get();
    if (exists === undefined) throw new Error(`Route ${route.id} is not on the phone any more`);
  }
  const version = save.createVersion;

  const calls: ConfigCall[] = [
    ...(save.createRoute === null ? [] : [configCalls.createRoute(save.createRoute)]),
    ...save.uploadPhotos.map(({ checkpoint_id, photo }) => checkpointPhotoCall(checkpoint_id, photo)),
    ...save.createCheckpoints.map((body) => configCalls.createCheckpoint(body)),
    ...save.activateCheckpoints.map((id) => configCalls.updateCheckpoint(id, { active: true })),
    ...(save.updateRoute === null ? [] : [configCalls.updateRoute(route.id, { order_mode: save.updateRoute.order_mode })]),
    configCalls.createRouteVersion(route.id, version),
  ];

  queueSupervisorAction(db, {
    apply: (tx) => {
      if (save.createRoute === null) {
        tx.update(routes)
          .set({ order_mode: route.order_mode, current_version_id: version.id, updated_at: now })
          .where(eq(routes.id, route.id))
          .run();
      } else {
        tx.insert(routes)
          .values({ ...save.createRoute, current_version_id: version.id, active: true, created_at: now, updated_at: now })
          .run();
      }
      for (const { checkpoint_id, photo } of save.uploadPhotos) insertCheckpointPhoto(tx, checkpoint_id, photo);
      for (const body of save.createCheckpoints) {
        tx.insert(checkpoints)
          .values({
            ...body,
            instruction: body.instruction ?? null,
            // The server generates the QR code of every checkpoint; its response brings it.
            qr_payload: null,
            lat_e7: body.lat_e7 ?? null,
            lng_e7: body.lng_e7 ?? null,
            accuracy_dm: body.accuracy_dm ?? null,
            photo_media_id: body.photo_media_id ?? null,
            active: true,
            created_at: now,
            updated_at: now,
          })
          .run();
      }
      if (save.activateCheckpoints.length > 0) {
        tx.update(checkpoints).set({ active: true, updated_at: now }).where(inArray(checkpoints.id, save.activateCheckpoints)).run();
      }
      insertRouteVersion(tx, route.id, version, { created_by: draft.supervisor_id, created_at: now });
      deleteKv(tx, 'training.draft');
    },
    calls,
  });
  return version.id;
}
