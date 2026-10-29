// Test helper: the site of src/domain/testing.ts in the database, as a pull would store it, with this phone enrolled
// on it. Only tests import it.
import { setDeviceCredentials } from '@/auth/credentials';
import type { Database } from '@/db/database';
import { setKv } from '@/db/kv';
import { checkpoints, devices, routes, routeVersionCheckpoints, routeVersions, schedules, sites } from '@/db/schema';
import { guardState, SITE } from '@/domain/testing';
import type { GuardState } from '@/domain/state';

export const DEVICE = '019a2b3c-4d5e-7f00-8a00-000000000004';
const SUPERVISOR = '019a2b3c-4d5e-7f00-8a00-000000000002';
const AT = '2026-10-27T12:00:00.000Z';
/** A valid device secret (32 bytes, base64). */
const SECRET = `${'A'.repeat(43)}=`;

/** Stores the fixture's configuration (guardState() without its shift and rounds) and enrolls the phone. */
export async function seedSite(db: Database, state: GuardState = guardState()): Promise<void> {
  db.insert(sites).values({ id: SITE, name: 'Raktár', address: null, timezone: state.timezone, no_data_alert_after_min: 90, created_by: SUPERVISOR, created_at: AT, updated_at: AT }).run();
  db.insert(devices).values({ id: DEVICE, site_id: SITE, name: 'Porta', platform: 'android', app_version: '0.1.0', enrolled_by: SUPERVISOR, enrolled_at: AT }).run();
  for (const [n, checkpoint] of state.checkpoints.entries()) {
    db.insert(checkpoints)
      .values({ ...checkpoint, site_id: SITE, name: `Pont ${n + 1}`, instruction: null, tag_type: 'nfc', accuracy_dm: null, photo_media_id: null, created_at: AT, updated_at: AT })
      .run();
  }
  for (const route of state.routes) {
    db.insert(routes).values({ ...route, site_id: SITE, name: `Útvonal ${route.id.slice(-2)}`, created_at: AT, updated_at: AT }).run();
  }
  for (const [n, version] of state.versions.entries()) {
    db.insert(routeVersions).values({ id: version.id, route_id: version.route_id, version: n + 1, walk_duration_s: null, created_by: SUPERVISOR, created_at: AT }).run();
    for (const [position, checkpoint_id] of version.checkpoint_ids.entries()) {
      db.insert(routeVersionCheckpoints).values({ route_version_id: version.id, checkpoint_id, position: position + 1, walk_time_from_prev_s: null }).run();
    }
  }
  for (const schedule of state.schedules) {
    db.insert(schedules)
      .values({ ...schedule, start_times: schedule.start_times === null ? null : [...schedule.start_times], name: `Menetrend ${schedule.id.slice(-2)}`, created_at: AT, updated_at: AT })
      .run();
  }
  setKv(db, 'device.id', DEVICE);
  await setDeviceCredentials({ token: 'device-token', secret: SECRET });
}
