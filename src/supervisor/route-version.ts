// What a new route version writes on the phone, for the training (training.ts) and the editing of a route
// (route-edit.ts) alike: the version with its number as the phone estimates it, its checkpoints, and the photos of
// checkpoints with their upload calls. The server numbers the versions (previous + 1): its response, or a pull, sets the
// real number, and a local version whose number the server gave to another one moves out of its way (sync/pull.ts).
import type { RouteVersionCreateRequest, Timestamp } from '@waypost/schema';
import { eq, max } from 'drizzle-orm';

import { configCalls, type ConfigCall } from '@/api/config-calls';
import type { PhotoFile } from '@/chain/payloads';
import type { Database } from '@/db/database';
import { media, routeVersionCheckpoints, routeVersions } from '@/db/schema';
import { photoFile } from '@/photo/files';

/** The number the route's next version gets as the phone knows the versions; the server's may be higher. */
export function nextVersionNumber(db: Database, routeId: string): number {
  const row = db
    .select({ last: max(routeVersions.version) })
    .from(routeVersions)
    .where(eq(routeVersions.route_id, routeId))
    .get();
  return (row?.last ?? 0) + 1;
}

/** Inserts the version (with the next number) and its checkpoints by position. */
export function insertRouteVersion(
  tx: Database,
  routeId: string,
  version: RouteVersionCreateRequest & { id: string },
  by: { created_by: string; created_at: Timestamp },
): void {
  tx.insert(routeVersions)
    .values({
      id: version.id,
      route_id: routeId,
      version: nextVersionNumber(tx, routeId),
      walk_duration_s: version.walk_duration_s ?? null,
      ...by,
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
}

/** The media row of a checkpoint's photo: its file becomes device data, sent by its outbox call. */
export function insertCheckpointPhoto(tx: Database, checkpointId: string, photo: PhotoFile): void {
  tx.insert(media)
    .values({
      id: photo.id,
      // A checkpoint photo is no chain entry's: its outbox call sends it (sync/outbox.ts).
      device_id: null,
      owner_type: 'checkpoint',
      owner_id: checkpointId,
      sha256: photo.sha256,
      mime: photo.mime,
      size_bytes: photo.size_bytes,
      local_uri: photoFile(photo.id).uri,
      taken_at: photo.taken_at,
    })
    .run();
}

/** The upload of a checkpoint's photo, queued before the checkpoint call that refers to it. */
export function checkpointPhotoCall(checkpointId: string, photo: PhotoFile): ConfigCall {
  return configCalls.uploadCheckpointPhoto(photo.id, {
    sha256: photo.sha256,
    owner_type: 'checkpoint',
    owner_id: checkpointId,
    taken_at: photo.taken_at,
  });
}
