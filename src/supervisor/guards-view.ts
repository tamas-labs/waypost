// The texts of the guards screen (S9): a guard's line, the supervisor's own PIN, and the PIN conflicts.
import type { Timestamp } from '@waypost/schema';

import { t } from '@/i18n';
import { parseTimestamp } from '@/time/timestamp';
import { DAY_MS, localDateOf, localTimeOf, parseLocalDate } from '@/time/zone';

import type { PinConflict, PinState, SiteGuard } from './guards';

/** "ma 20:00", "tegnap 20:00", otherwise "10. 24. 20:00", in the site's time zone. */
export function shiftTime(at: Timestamp, nowMs: number, timeZone: string): string {
  const atMs = parseTimestamp(at);
  const time = localTimeOf(atMs, timeZone);
  const date = localDateOf(atMs, timeZone);
  const days = Math.round((parseLocalDate(localDateOf(nowMs, timeZone)) - parseLocalDate(date)) / DAY_MS);
  if (days === 0) return t('guards.today', { time });
  if (days === 1) return t('guards.yesterday', { time });
  const [, month = '', day = ''] = date.split('-');
  return t('sync.dateTime', { month, day, time });
}

const pinText = (pin: PinState) => (pin === 'set' ? [t('guards.pinSet')] : pin === 'none' ? [t('guards.noPin')] : []);

/** "PIN beállítva · most műszakban", "Utolsó műszak: tegnap 20:00"; suspended: "Felfüggesztve · nem tud belépni". */
export function guardLine(guard: SiteGuard, nowMs: number, timeZone: string): string {
  if (!guard.active) return t('guards.suspended');
  const shift = guard.on_shift
    ? [t('guards.onShiftNow')]
    : guard.last_shift_at === null
      ? []
      : [t('guards.lastShift', { when: shiftTime(guard.last_shift_at, nowMs, timeZone) })];
  const parts = [...pinText(guard.pin), ...shift];
  return parts.length === 0 ? t('guards.canLogIn') : parts.join(' · ');
}

/** "Kovács Anna · beállítva". */
export function ownPinLine(me: { name: string; pin: PinState }): string {
  return [me.name, ...(me.pin === 'set' ? [t('guards.ownPinSet')] : me.pin === 'none' ? [t('guards.ownPinNone')] : [])].join(' · ');
}

/** The title and the sentence of a refused PIN. */
export function conflictText(conflict: PinConflict): { title: string; text: string } {
  switch (conflict.kind) {
    case 'create':
      return { title: t('guards.conflict.createTitle'), text: t('guards.conflict.create') };
    case 'pin':
      return { title: t('guards.conflict.title', { name: conflict.user?.name ?? '' }), text: t('guards.conflict.pin') };
    case 'attach':
      return {
        title: t('guards.conflict.title', { name: conflict.user?.name ?? t('guards.conflict.someone') }),
        text: t('guards.conflict.attach'),
      };
  }
}
