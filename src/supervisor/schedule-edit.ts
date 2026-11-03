// The schedule of a route in supervisor mode (the rules: domain/schedule-edit.ts): the route, its current version's
// measured walk and its schedule from the local database, and the save, one supervisor action: the local record at once
// (the site phone's rounds and alarms follow it: alarms/round-alarms.ts reschedules after every queued action), the call
// through the outbox (sync/outbox.ts).
import type { Timestamp } from '@waypost/schema';
import { asc, desc, eq } from 'drizzle-orm';

import { configCalls } from '@/api/config-calls';
import type { Database } from '@/db/database';
import { routes, routeVersions, schedules } from '@/db/schema';
import { rulesOf, scheduleSave, type ScheduleEdit, type ScheduleEditBase } from '@/domain/schedule-edit';
import type { NewId } from '@/domain/state';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

/**
 * The route with the walk of its current version and its schedule: the active one first, then the oldest, if it has
 * more (they are edited on the web). null without the route on the phone.
 */
export function loadScheduleEditBase(db: Database, routeId: string): ScheduleEditBase | null {
  const route = db
    .select({ id: routes.id, name: routes.name, walk_duration_s: routeVersions.walk_duration_s })
    .from(routes)
    .leftJoin(routeVersions, eq(routeVersions.id, routes.current_version_id))
    .where(eq(routes.id, routeId))
    .get();
  if (route === undefined) return null;
  const rows = db
    .select()
    .from(schedules)
    .where(eq(schedules.route_id, routeId))
    .orderBy(desc(schedules.active), asc(schedules.created_at), asc(schedules.id))
    .all();
  const [first] = rows;
  return {
    route: { id: route.id, name: route.name },
    walk_duration_s: route.walk_duration_s ?? null,
    schedule:
      first === undefined
        ? null
        : {
            id: first.id,
            name: first.name,
            weekdays: first.weekdays,
            mode: first.mode,
            start_times: first.start_times ?? null,
            interval_from: first.interval_from,
            interval_to: first.interval_to,
            interval_every_min: first.interval_every_min,
            time_limit_min: first.time_limit_min,
            active: first.active,
          },
    schedule_count: rows.length,
  };
}

/**
 * Saves the schedule: a new one is created, a saved one changed (only what changed goes to the server; the local record
 * gets the whole draft, with the other mode's fields cleared as the server clears them). Throws ScheduleEditError if it
 * cannot be saved or nothing changed. Returns the schedule's ID.
 */
export function saveScheduleEdit(db: Database, edit: ScheduleEdit, now: Timestamp = nowTimestamp(), newId: NewId = uuidv7): string {
  const save = scheduleSave(edit);
  const { draft } = edit;
  const record = {
    ...rulesOf(draft),
    start_times: draft.mode === 'list' ? draft.start_times : null,
    time_limit_min: draft.time_limit_min,
    active: draft.active,
  };
  if (save.kind === 'create') {
    const id = newId();
    queueSupervisorAction(db, {
      apply: (tx) => {
        tx.insert(schedules)
          .values({ id, route_id: save.body.route_id, name: save.body.name, ...record, created_at: now, updated_at: now })
          .run();
      },
      calls: [configCalls.createSchedule({ id, ...save.body })],
    });
    return id;
  }
  queueSupervisorAction(db, {
    apply: (tx) => {
      tx.update(schedules)
        .set({ ...record, updated_at: now })
        .where(eq(schedules.id, save.id))
        .run();
    },
    calls: [configCalls.updateSchedule(save.id, save.body)],
  });
  return save.id;
}
