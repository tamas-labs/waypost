// The site details of the supervisor mode (S3): what the phone has of a site – its supervisors, routes, schedules,
// guards, the report subscriptions of the supervisor using the phone, and the site phone – and these in words. The
// warning about the last problem round of the design needs round data the phone does not get (Q15, M5-20).
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { Database } from '@/db/database';
import {
  devices,
  reportSubscriptions,
  routes,
  routeVersionCheckpoints,
  routeVersions,
  schedules,
  sites,
  siteUser,
  users,
} from '@/db/schema';
import type { ScheduleRules } from '@/domain/schedule';
import { t, type TranslationKey } from '@/i18n';
import { scheduleSummary } from '@/i18n/schedule';

export type ReportFrequency = (typeof reportSubscriptions.$inferSelect)['frequency'];

export interface SiteRoute {
  id: string;
  name: string;
  active: boolean;
  order_mode: 'free' | 'fixed';
  /** The current version; null before the first training. */
  version: { number: number; points: number; walk_duration_s: number | null } | null;
}

export type SiteSchedule = ScheduleRules & { id: string; name: string; route_id: string; active: boolean; time_limit_min: number | null };

export interface SitePhone {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  app_version: string;
  enrolled_at: string;
}

export interface SiteDetail {
  id: string;
  name: string;
  timezone: string;
  /** The active supervisors of the site, by name. */
  supervisors: string[];
  /** Active routes first, each by name. */
  routes: SiteRoute[];
  schedules: SiteSchedule[];
  /** The active guards of the site, by name. */
  guards: string[];
  /** The frequencies the supervisor using the phone has subscribed to for this site, in the order of the design. */
  reports: ReportFrequency[];
  /** The phone enrolled to the site (the server sends no revoked one); null: none. */
  phone: SitePhone | null;
}

const REPORT_ORDER: readonly ReportFrequency[] = ['shift', 'daily', 'weekly', 'monthly'];
const byName = (a: string, b: string) => a.localeCompare(b, 'hu');

/** The site's details; null if the phone does not have the site (e.g. a pull has removed it). accountId: whose reports. */
export function loadSiteDetail(db: Database, siteId: string, accountId: string | null): SiteDetail | null {
  const site = db.select({ id: sites.id, name: sites.name, timezone: sites.timezone }).from(sites).where(eq(sites.id, siteId)).get();
  if (site === undefined) return null;

  const people = db
    .select({ name: users.name, role: users.role })
    .from(siteUser)
    .innerJoin(users, eq(users.id, siteUser.user_id))
    .where(and(eq(siteUser.site_id, siteId), eq(users.active, true)))
    .all();
  const namesOf = (role: 'supervisor' | 'guard') =>
    people
      .filter((person) => person.role === role)
      .map((person) => person.name)
      .sort(byName);

  const routeRows = db
    .select({
      id: routes.id,
      name: routes.name,
      active: routes.active,
      order_mode: routes.order_mode,
      number: routeVersions.version,
      walk_duration_s: routeVersions.walk_duration_s,
      version_id: routeVersions.id,
    })
    .from(routes)
    .leftJoin(routeVersions, eq(routeVersions.id, routes.current_version_id))
    .where(eq(routes.site_id, siteId))
    .all();
  const versionIds = routeRows.flatMap((route) => (route.version_id === null ? [] : [route.version_id]));
  const points = new Map<string, number>();
  if (versionIds.length > 0) {
    for (const row of db
      .select({ version: routeVersionCheckpoints.route_version_id })
      .from(routeVersionCheckpoints)
      .where(inArray(routeVersionCheckpoints.route_version_id, versionIds))
      .all()) {
      points.set(row.version, (points.get(row.version) ?? 0) + 1);
    }
  }
  const siteRoutes: SiteRoute[] = routeRows
    .map((route) => ({
      id: route.id,
      name: route.name,
      active: route.active,
      order_mode: route.order_mode,
      version:
        route.version_id === null || route.number === null
          ? null
          : { number: route.number, points: points.get(route.version_id) ?? 0, walk_duration_s: route.walk_duration_s },
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || byName(a.name, b.name));

  const routeIds = routeRows.map((route) => route.id);
  const siteSchedules: SiteSchedule[] =
    routeIds.length === 0
      ? []
      : db
          .select()
          .from(schedules)
          .where(inArray(schedules.route_id, routeIds))
          .all()
          .map((schedule) => ({
            id: schedule.id,
            name: schedule.name,
            route_id: schedule.route_id,
            active: schedule.active,
            weekdays: schedule.weekdays,
            mode: schedule.mode,
            start_times: schedule.start_times,
            interval_from: schedule.interval_from,
            interval_to: schedule.interval_to,
            interval_every_min: schedule.interval_every_min,
            time_limit_min: schedule.time_limit_min,
          }))
          .sort((a, b) => Number(b.active) - Number(a.active) || byName(a.name, b.name));

  const subscribed = new Set(
    accountId === null
      ? []
      : db
          .select({ frequency: reportSubscriptions.frequency })
          .from(reportSubscriptions)
          .where(and(eq(reportSubscriptions.site_id, siteId), eq(reportSubscriptions.user_id, accountId)))
          .all()
          .map((row) => row.frequency),
  );

  const phone =
    db
      .select({
        id: devices.id,
        name: devices.name,
        platform: devices.platform,
        app_version: devices.app_version,
        enrolled_at: devices.enrolled_at,
      })
      .from(devices)
      .where(and(eq(devices.site_id, siteId), isNull(devices.revoked_at)))
      .orderBy(asc(devices.enrolled_at))
      .get() ?? null;

  return {
    ...site,
    supervisors: namesOf('supervisor'),
    routes: siteRoutes,
    schedules: siteSchedules,
    guards: namesOf('guard'),
    reports: REPORT_ORDER.filter((frequency) => subscribed.has(frequency)),
    phone,
  };
}

// --- In words ---

/** "16:20", or "1:02:05" from an hour. */
export function formatWalk(seconds: number): string {
  const s = seconds % 60;
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "9 pont · szabad sorrend · v4 · bejárás 16:20"; "Még nincs betanítva · …" before the first version; inactive marked. */
export function routeSummary(route: SiteRoute): string {
  const order = t(route.order_mode === 'fixed' ? 'supervisor.fixedOrder' : 'supervisor.freeOrder');
  const { version } = route;
  const line =
    version === null
      ? `${t('supervisor.notTrained')} · ${order}`
      : version.walk_duration_s === null
        ? t('supervisor.routeMetaNoWalk', { points: version.points, order, version: version.number })
        : t('supervisor.routeMeta', { points: version.points, order, version: version.number, walk: formatWalk(version.walk_duration_s) });
  return route.active ? line : `${line} · ${t('supervisor.inactive')}`;
}

/** The schedule row: the only active schedule in one line, otherwise their number; none: "Nincs menetrend". */
export function schedulesSummary(list: readonly SiteSchedule[]): string {
  const active = list.filter((schedule) => schedule.active);
  const [only] = active;
  if (only !== undefined && active.length === 1) return scheduleSummary(only);
  if (active.length > 1) return t('supervisor.schedulesCount', { count: active.length });
  return list.length > 0 ? t('supervisor.schedulesInactive', { count: list.length }) : t('supervisor.noSchedule');
}

/** "3 őr · Nagy Péter, Kiss Gábor, Tóth Eszter"; none: "Még nincs őr". */
export function guardsSummary(names: readonly string[]): string {
  return names.length === 0 ? t('supervisor.noGuard') : t('supervisor.guardsLine', { count: names.length, names: names.join(', ') });
}

/** "2 supervisor · Kovács Anna, Szabó Dávid". */
export function supervisorsSummary(names: readonly string[]): string | undefined {
  return names.length === 0 ? undefined : t('supervisor.supervisorsLine', { count: names.length, names: names.join(', ') });
}

const REPORT_TEXT: Record<ReportFrequency, TranslationKey> = {
  shift: 'supervisor.reportShift',
  daily: 'supervisor.reportDaily',
  weekly: 'supervisor.reportWeekly',
  monthly: 'supervisor.reportMonthly',
};

/** "Műszak és heti · kovacs.anna@pelda.hu"; none: "Nincs feliratkozás". */
export function reportsSummary(frequencies: readonly ReportFrequency[], email: string | null): string {
  if (frequencies.length === 0) return t('supervisor.noReports');
  const words = frequencies.map((frequency) => t(REPORT_TEXT[frequency]));
  const listed = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} ${t('supervisor.and')} ${words.at(-1)!}`;
  const capitalised = listed.charAt(0).toLocaleUpperCase('hu') + listed.slice(1);
  return email === null ? capitalised : `${capitalised} · ${email}`;
}
