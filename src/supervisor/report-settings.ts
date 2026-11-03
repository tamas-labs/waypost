// The report settings of a site in supervisor mode (S10; the rules: domain/report-settings.ts): the supervisor's own
// subscriptions, the others' (they decide the retention too), the site's no-data alert, and the save, one supervisor
// action: the local records at once, the calls through the outbox (a subscription for every report turned on, its
// deletion for one turned off, the site's alert if it changed).
import type { Timestamp } from '@waypost/schema';
import { eq, inArray } from 'drizzle-orm';

import { configCalls, type ConfigCall } from '@/api/config-calls';
import type { Database } from '@/db/database';
import { reportSubscriptions, sites } from '@/db/schema';
import {
  orderedFrequencies,
  reportSettingsChanges,
  type ReportFrequency,
  type ReportSettings,
  type ReportSettingsChanges,
} from '@/domain/report-settings';
import type { NewId } from '@/domain/state';
import { uuidv7 } from '@/id/uuidv7';
import { queueSupervisorAction } from '@/sync/outbox';
import { nowTimestamp } from '@/time/timestamp';

export interface ReportSettingsBase {
  site: { id: string; name: string };
  /** The supervisor whose subscriptions these are. */
  user_id: string;
  /** Their subscriptions, by frequency. */
  subscriptions: Partial<Record<ReportFrequency, string>>;
  /** What the phone has saved. */
  saved: ReportSettings;
  /** The reports the site's other supervisors get. */
  others: ReportFrequency[];
}

/** The site's settings for this supervisor; null without the site on the phone. */
export function loadReportSettings(db: Database, siteId: string, userId: string): ReportSettingsBase | null {
  const site = db
    .select({ id: sites.id, name: sites.name, alert: sites.no_data_alert_after_min })
    .from(sites)
    .where(eq(sites.id, siteId))
    .get();
  if (site === undefined) return null;
  const rows = db
    .select({ id: reportSubscriptions.id, user_id: reportSubscriptions.user_id, frequency: reportSubscriptions.frequency })
    .from(reportSubscriptions)
    .where(eq(reportSubscriptions.site_id, siteId))
    .all();
  const own = rows.filter((row) => row.user_id === userId);
  return {
    site: { id: site.id, name: site.name },
    user_id: userId,
    subscriptions: Object.fromEntries(own.map((row) => [row.frequency, row.id])),
    saved: { frequencies: orderedFrequencies(own.map((row) => row.frequency)), alert_after_min: site.alert },
    others: orderedFrequencies(rows.filter((row) => row.user_id !== userId).map((row) => row.frequency)),
  };
}

/**
 * Saves the draft against the base: nothing if it changes nothing. A subscription turned off and on again in one
 * draft is unchanged; one turned off is deleted by its id (one created on the phone and not yet sent is deleted after
 * its creation, the outbox keeps the order). Returns the changes.
 */
export function saveReportSettings(
  db: Database,
  base: ReportSettingsBase,
  draft: ReportSettings,
  now: Timestamp = nowTimestamp(),
  newId: NewId = uuidv7,
): ReportSettingsChanges {
  const changes = reportSettingsChanges(base.saved, draft);
  const created = changes.subscribe.map((frequency) => ({ id: newId(), frequency }));
  const deleted = changes.unsubscribe.flatMap((frequency) => base.subscriptions[frequency] ?? []);
  const calls: ConfigCall[] = [
    ...created.map(({ id, frequency }) =>
      configCalls.createReportSubscription({ id, user_id: base.user_id, site_id: base.site.id, frequency }),
    ),
    ...deleted.map((id) => configCalls.deleteReportSubscription(id)),
    ...(changes.alert_after_min === null
      ? []
      : [configCalls.updateSite(base.site.id, { no_data_alert_after_min: changes.alert_after_min })]),
  ];
  if (calls.length === 0) return changes;

  queueSupervisorAction(db, {
    apply: (tx) => {
      for (const { id, frequency } of created) {
        tx.insert(reportSubscriptions).values({ id, user_id: base.user_id, site_id: base.site.id, frequency }).run();
      }
      if (deleted.length > 0) tx.delete(reportSubscriptions).where(inArray(reportSubscriptions.id, deleted)).run();
      if (changes.alert_after_min !== null) {
        tx.update(sites).set({ no_data_alert_after_min: changes.alert_after_min, updated_at: now }).where(eq(sites.id, base.site.id)).run();
      }
    },
    calls,
  });
  return changes;
}
