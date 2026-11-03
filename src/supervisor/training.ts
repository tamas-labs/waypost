// Training a route in supervisor mode (the rules: domain/training.ts): the checkpoints of the site from the local
// database, the draft kept in the kv table until it is saved or discarded (so a restart of the app does not lose the
// walk), and the save, which is one supervisor action: the local records at once, and the calls through the outbox
// (sync/outbox.ts). A call the server refuses (e.g. 409: the tag was taken on another phone meanwhile) is shown to the
// supervisor like any refused action, and the next pull brings the server's state back (decisions: "Betanítás – domain").
import type { Timestamp } from '@waypost/schema';
import { and, eq, inArray, max } from 'drizzle-orm';

import { configCalls, type ConfigCall } from '@/api/config-calls';
import type { Database } from '@/db/database';
import { deleteKv, getKv, setKv } from '@/db/kv';
import { checkpoints, routes, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import type { NewId } from '@/domain/state';
import {
  startTraining,
  trainingSave,
  type OrderMode,
  type SiteCheckpoint,
  type TrainingDraft,
  type TrainingInstant,
} from '@/domain/training';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

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

export function storeTrainingDraft(db: Database, draft: TrainingDraft): void {
  setKv(db, 'training.draft', draft);
}

export function discardTrainingDraft(db: Database): void {
  deleteKv(db, 'training.draft');
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

/** The next version number as the phone knows it; the server's response sets the real one (M5-14). */
function nextVersion(tx: Database, routeId: string): number {
  const row = tx
    .select({ last: max(routeVersions.version) })
    .from(routeVersions)
    .where(eq(routeVersions.route_id, routeId))
    .get();
  return (row?.last ?? 0) + 1;
}

/**
 * Saves the draft as the route's new version: the route (created, or its order mode changed), the new checkpoints,
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
            photo_media_id: null,
            active: true,
            created_at: now,
            updated_at: now,
          })
          .run();
      }
      if (save.activateCheckpoints.length > 0) {
        tx.update(checkpoints).set({ active: true, updated_at: now }).where(inArray(checkpoints.id, save.activateCheckpoints)).run();
      }
      tx.insert(routeVersions)
        .values({
          id: version.id,
          route_id: route.id,
          version: nextVersion(tx, route.id),
          walk_duration_s: version.walk_duration_s,
          created_by: draft.supervisor_id,
          created_at: now,
        })
        .run();
      tx.insert(routeVersionCheckpoints)
        .values(
          version.checkpoints.map((point, index) => ({
            route_version_id: version.id,
            checkpoint_id: point.checkpoint_id,
            position: index + 1,
            walk_time_from_prev_s: point.walk_time_from_prev_s ?? null,
          })),
        )
        .run();
      deleteKv(tx, 'training.draft');
    },
    calls,
  });
  return version.id;
}
