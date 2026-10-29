// The domain's input (src/domain/state.ts) read from the database: the site of the site phone, its configuration
// and the projections of the chain. A rule whose output goes to the chain reads it inside appendDecidedEntries, so
// the state is the one its entries are applied to.
import type { Timestamp } from '@waypost/schema';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { getKv } from '@/db/kv';
import { checkpoints, devices, routes, routeVersionCheckpoints, routeVersions, rounds, scans, schedules, shifts, sites } from '@/db/schema';
import type { GuardState, RoundInfo, RouteVersionInfo } from '@/domain/state';
import { parseTimestamp, toTimestamp } from '@/time/timestamp';
import { DAY_MS } from '@/time/zone';

/** Closed rounds are loaded from this many days before the shift start (or now), so their slots do not open again. */
export const CLOSED_ROUNDS_DAYS = 2;

/** The state of the phone's site at now; null while the phone is not enrolled or its site is not pulled yet. */
export function loadGuardState(db: Database, now: Timestamp): GuardState | null {
  const deviceId = getKv(db, 'device.id');
  if (deviceId === null) return null;
  const siteId = db.select({ site_id: devices.site_id }).from(devices).where(eq(devices.id, deviceId)).get()?.site_id ?? null;
  if (siteId === null) return null;
  const site = db.select({ timezone: sites.timezone }).from(sites).where(eq(sites.id, siteId)).get();
  if (site === undefined) return null;

  const shift =
    db
      .select({ id: shifts.id, guard_id: shifts.guard_id, started_at: shifts.started_at })
      .from(shifts)
      .where(and(eq(shifts.site_id, siteId), eq(shifts.device_id, deviceId), isNull(shifts.ended_at)))
      .orderBy(desc(shifts.started_at))
      .limit(1)
      .get() ?? null;

  const routeRows = db
    .select({ id: routes.id, order_mode: routes.order_mode, current_version_id: routes.current_version_id, active: routes.active })
    .from(routes)
    .where(eq(routes.site_id, siteId))
    .orderBy(asc(routes.id))
    .all();
  const scheduleRows = db
    .select({
      id: schedules.id,
      route_id: schedules.route_id,
      weekdays: schedules.weekdays,
      mode: schedules.mode,
      start_times: schedules.start_times,
      interval_from: schedules.interval_from,
      interval_to: schedules.interval_to,
      interval_every_min: schedules.interval_every_min,
      time_limit_min: schedules.time_limit_min,
      active: schedules.active,
    })
    .from(schedules)
    .where(
      inArray(
        schedules.route_id,
        routeRows.map((route) => route.id),
      ),
    )
    .orderBy(asc(schedules.id))
    .all();

  const since = toTimestamp(Math.min(parseTimestamp(now), shift === null ? Infinity : parseTimestamp(shift.started_at)) - CLOSED_ROUNDS_DAYS * DAY_MS);
  const roundRows = db
    .select({
      id: rounds.id,
      shift_id: rounds.shift_id,
      route_version_id: rounds.route_version_id,
      schedule_id: rounds.schedule_id,
      scheduled_at: rounds.scheduled_at,
      time_limit_min: rounds.time_limit_min,
      status: rounds.status,
    })
    .from(rounds)
    .innerJoin(shifts, eq(shifts.id, rounds.shift_id))
    .where(and(eq(shifts.site_id, siteId), or(inArray(rounds.status, ['open', 'in_progress']), gte(rounds.scheduled_at, since))))
    .orderBy(asc(rounds.scheduled_at), asc(rounds.id))
    .all();

  const versionIds = [...new Set([...routeRows.flatMap((route) => (route.current_version_id === null ? [] : [route.current_version_id])), ...roundRows.map((round) => round.route_version_id)])];
  const versionRoutes = db.select({ id: routeVersions.id, route_id: routeVersions.route_id }).from(routeVersions).where(inArray(routeVersions.id, versionIds)).orderBy(asc(routeVersions.id)).all();
  const versionCheckpoints = db
    .select({ route_version_id: routeVersionCheckpoints.route_version_id, checkpoint_id: routeVersionCheckpoints.checkpoint_id })
    .from(routeVersionCheckpoints)
    .where(inArray(routeVersionCheckpoints.route_version_id, versionIds))
    .orderBy(asc(routeVersionCheckpoints.position))
    .all();
  const versions: RouteVersionInfo[] = versionRoutes.map((version) => ({
    id: version.id,
    route_id: version.route_id,
    checkpoint_ids: versionCheckpoints.filter((row) => row.route_version_id === version.id).map((row) => row.checkpoint_id),
  }));

  const scanRows = db
    .select({ round_id: scans.round_id, checkpoint_id: scans.checkpoint_id, scanned_at: scans.scanned_at })
    .from(scans)
    .where(
      and(
        inArray(
          scans.round_id,
          roundRows.map((round) => round.id),
        ),
        isNotNull(scans.checkpoint_id),
      ),
    )
    .orderBy(asc(scans.scanned_at))
    .all();
  const routeOfVersion = new Map(versions.map((version) => [version.id, version.route_id]));
  const routeOfSchedule = new Map(scheduleRows.map((schedule) => [schedule.id, schedule.route_id]));
  // The route of a round is that of its version; a round whose version and schedule are both gone is left out.
  const roundInfos: RoundInfo[] = roundRows.flatMap((round) => {
    const routeId = routeOfVersion.get(round.route_version_id) ?? routeOfSchedule.get(round.schedule_id);
    if (routeId === undefined) return [];
    const roundScans = scanRows.flatMap((scan) => (scan.round_id === round.id && scan.checkpoint_id !== null ? [{ checkpoint_id: scan.checkpoint_id, scanned_at: scan.scanned_at }] : []));
    return [{ ...round, route_id: routeId, scans: roundScans }];
  });

  const checkpointRows = db
    .select({ id: checkpoints.id, tag_uid: checkpoints.tag_uid, qr_payload: checkpoints.qr_payload, lat_e7: checkpoints.lat_e7, lng_e7: checkpoints.lng_e7, active: checkpoints.active })
    .from(checkpoints)
    .where(eq(checkpoints.site_id, siteId))
    .orderBy(asc(checkpoints.id))
    .all();

  return { site_id: siteId, timezone: site.timezone, shift, routes: routeRows, schedules: scheduleRows, versions, checkpoints: checkpointRows, rounds: roundInfos };
}
