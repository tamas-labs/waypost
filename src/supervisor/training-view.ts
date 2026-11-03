// The texts of the training screens (S5, S6): the counter, the walk times and the meta line of a point, and what a
// training rule that cannot be applied tells the supervisor.
import { ROUTE_POINTS_MAX, TrainingError, type CheckpointLocation, type TrainingDraft, type TrainingPoint } from '@/domain/training';
import { t } from '@/i18n';

import { formatWalk } from './site-detail';

const pad = (n: number) => String(n).padStart(2, '0');

/** The counter: "06:42", "1:06:42"; "–" across a reboot, where the monotonic clock starts again. */
export function elapsedText(ms: number | null): string {
  if (ms === null) return t('training.walkUnknown');
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const rest = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return h > 0 ? `${h}:${rest}` : rest;
}

/** The walk from the previous point: "start" at the first, "+1:35", "–" across a reboot. */
export function walkText(seconds: number | null, index: number): string {
  if (index === 0) return t('training.walkStart');
  return seconds === null ? t('training.walkUnknown') : `+${formatWalk(seconds)}`;
}

/** "GPS ±5 m", or that the scan had no location (none, or a mocked one). */
export function gpsText(location: CheckpointLocation): string {
  if (location.accuracy_dm === null || location.accuracy_dm === undefined) return t('training.metaNoGps');
  return t('training.metaGps', { accuracy: Math.max(1, Math.round(location.accuracy_dm / 10)) });
}

/** "NFC · fotó · utasítás · GPS ±4 m"; an existing checkpoint: "Meglévő pont", "kikapcsolva" if the save switches it on. */
export function pointMeta(point: TrainingPoint): string {
  if (point.kind === 'existing') return [t('training.metaExisting'), ...(point.active ? [] : [t('training.metaInactive')])].join(' · ');
  return [
    t('method.nfc'),
    ...(point.photo == null ? [] : [t('training.metaPhoto')]),
    ...(point.instruction === null ? [] : [t('training.metaInstruction')]),
    gpsText(point.location),
  ].join(' · ');
}

/** The route's name in the header; a new one is "Új útvonal" until it is named at the save. */
export function routeTitle(draft: TrainingDraft): string {
  const name = draft.route.name.trim();
  return name === '' ? t('training.newRoute') : name;
}

/** What the screen says when the save cannot go on (the route name has its own place, under its field). */
export function trainingErrorText(error: unknown, draft: TrainingDraft): string {
  if (!(error instanceof TrainingError))
    return t('training.errors.failed', { message: error instanceof Error ? error.message : String(error) });
  switch (error.code) {
    case 'no_points':
      return t('training.errors.noPoints');
    case 'too_many_points':
      return t('training.errors.tooManyPoints', { max: ROUTE_POINTS_MAX });
    case 'tag_taken': {
      const names = draft.points.filter((point) => error.checkpointIds.includes(point.checkpoint_id)).map((point) => `„${point.name}”`);
      return t('training.errors.tagTaken', { names: names.join(', ') });
    }
    case 'route_name_required':
      return t('training.routeNameMissing');
    case 'name_required':
      return t('training.nameMissing');
    case 'in_draft':
      return t('training.errors.inDraft');
    case 'not_in_draft':
    case 'not_new':
      return t('training.errors.failed', { message: error.message });
  }
}
