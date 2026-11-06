// The rows of the error log on the device setup screen: when (by the phone's own time zone), where, and the message.
import { t } from '@/i18n';
import { parseTimestamp } from '@/time/timestamp';
import { localDateOf, localTimeOf } from '@/time/zone';

import type { LoggedError } from './error-log';

export interface ErrorLogRow {
  key: string;
  title: string;
  /** What was being done and the message, e.g. "interval · TypeError: …". */
  detail: string;
}

/** The phone's own time zone (the log is about the phone, not a site). */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function errorLogRows(entries: readonly LoggedError[], timeZone: string): ErrorLogRow[] {
  return entries.map((entry, index) => {
    const ms = parseTimestamp(entry.at);
    return {
      key: `${entry.at}:${index}`,
      title: t('errorLog.entry', {
        time: `${localDateOf(ms, timeZone)} ${localTimeOf(ms, timeZone)}`,
        source: t(`errorLog.sources.${entry.source}`),
      }),
      detail: entry.detail === null ? entry.message : `${entry.detail} · ${entry.message}`,
    };
  });
}
