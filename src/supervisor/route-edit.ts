// Editing a route in supervisor mode (the rules: domain/route-edit.ts): the route and its current version from the
// local database, and the save, which is one supervisor action like the training's: the local records at once, the
// calls through the outbox (sync/outbox.ts). The version number the phone shows is its estimate; the server's response
// or the next pull sets the real one (route-version.ts).
import type { Timestamp } from '@waypost/schema';
import { asc, eq } from 'drizzle-orm';

import { configCalls, type ConfigCall } from '@/api/config-calls';
import type { Database } from '@/db/database';
import { checkpoints, routes, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { RouteEditError, routeEditSave, type RouteEdit, type RouteEditBase } from '@/domain/route-edit';
import type { NewId } from '@/domain/state';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

import { checkpointPhotoCall, insertCheckpointPhoto, insertRouteVersion } from './route-version';

/** The route and its current version with the checkpoints by position; null without a route or a version on the phone. */
export function loadRouteEditBase(db: Database, routeId: string): RouteEditBase | null {
  const row = db
    .select({
      id: routes.id,
      site_id: routes.site_id,
      name: routes.name,
      order_mode: routes.order_mode,
      version_id: routeVersions.id,
      version: routeVersions.version,
      walk_duration_s: routeVersions.walk_duration_s,
    })
    .from(routes)
    .innerJoin(routeVersions, eq(routeVersions.id, routes.current_version_id))
    .where(eq(routes.id, routeId))
    .get();
  if (row === undefined) return null;
  const points = db
    .select({
      checkpoint_id: routeVersionCheckpoints.checkpoint_id,
      name: checkpoints.name,
      tag_type: checkpoints.tag_type,
      instruction: checkpoints.instruction,
      photo_media_id: checkpoints.photo_media_id,
      walk_time_from_prev_s: routeVersionCheckpoints.walk_time_from_prev_s,
    })
    .from(routeVersionCheckpoints)
    // A checkpoint deleted on the server is not on the phone: it cannot stay on the route.
    .innerJoin(checkpoints, eq(checkpoints.id, routeVersionCheckpoints.checkpoint_id))
    .where(eq(routeVersionCheckpoints.route_version_id, row.version_id))
    .orderBy(asc(routeVersionCheckpoints.position))
    .all();
  const { id, site_id, name, order_mode, version_id, version, walk_duration_s } = row;
  return { route: { id, site_id, name, order_mode }, version_id, version, walk_duration_s, points };
}

/**
 * Saves the edited route as its new version: the photos taken (as media rows) and the changed checkpoints, the route
 * (name, order mode, the new version as its current one), the version – locally at once and through the outbox in
 * this order. Throws RouteEditError if it cannot be saved, also when the route has another current version than the
 * one the editing started from (stale): nothing changes then. Returns the ID of the new version.
 */
export function saveRouteEdit(
  db: Database,
  edit: RouteEdit,
  supervisorId: string,
  now: Timestamp = nowTimestamp(),
  newId: NewId = uuidv7,
): string {
  const save = routeEditSave(edit, newId);
  const routeId = edit.base.route.id;
  const route = db.select({ current: routes.current_version_id }).from(routes).where(eq(routes.id, routeId)).get();
  if (route?.current !== edit.base.version_id) throw new RouteEditError('stale', 'The route has another current version');
  const version = save.createVersion;

  const calls: ConfigCall[] = [
    ...save.uploadPhotos.map(({ checkpoint_id, photo }) => checkpointPhotoCall(checkpoint_id, photo)),
    ...save.updateCheckpoints.map(({ id, body }) => configCalls.updateCheckpoint(id, body)),
    ...(save.updateRoute === null ? [] : [configCalls.updateRoute(routeId, save.updateRoute)]),
    configCalls.createRouteVersion(routeId, version),
  ];

  queueSupervisorAction(db, {
    apply: (tx) => {
      for (const { checkpoint_id, photo } of save.uploadPhotos) insertCheckpointPhoto(tx, checkpoint_id, photo);
      for (const { id, body } of save.updateCheckpoints) {
        tx.update(checkpoints)
          .set({ ...body, updated_at: now })
          .where(eq(checkpoints.id, id))
          .run();
      }
      tx.update(routes)
        .set({ ...save.updateRoute, current_version_id: version.id, updated_at: now })
        .where(eq(routes.id, routeId))
        .run();
      insertRouteVersion(tx, routeId, version, { created_by: supervisorId, created_at: now });
    },
    calls,
  });
  return version.id;
}
