// The texts of the route editing (S7): the header line, the meta line of a point, and what a rule of the editing that
// cannot be applied tells the supervisor.
import { RouteEditError, type EditPoint, type RouteEdit, type VersionPoint } from '@/domain/route-edit';
import type { OrderMode } from '@/domain/training';
import { t } from '@/i18n';

const orderText = (mode: OrderMode) => t(mode === 'fixed' ? 'supervisor.fixedOrder' : 'supervisor.freeOrder');

/** "v4 szerkesztése · szabad sorrend": the version edited and the order as it is now. */
export function editHeaderLine(edit: RouteEdit): string {
  return t('routeEdit.header', { version: edit.base.version, order: orderText(edit.order_mode) });
}

/** "NFC · fotó · utasítás": how the point is scanned and what it has. */
export function editPointMeta(point: EditPoint, tagType: VersionPoint['tag_type']): string {
  return [
    t(tagType === 'qr' ? 'method.qr' : 'method.nfc'),
    ...(point.photo === null ? [] : [t('training.metaPhoto')]),
    ...(point.instruction === null ? [] : [t('training.metaInstruction')]),
  ].join(' · ');
}

/** What the screen says when the save cannot go on. */
export function routeEditErrorText(error: unknown): string {
  if (!(error instanceof RouteEditError))
    return t('training.errors.failed', { message: error instanceof Error ? error.message : String(error) });
  switch (error.code) {
    case 'name_required':
      return t('training.nameMissing');
    case 'route_name_required':
      return t('training.routeNameMissing');
    case 'no_points':
      return t('routeEdit.errors.noPoints');
    case 'unchanged':
      return t('routeEdit.errors.unchanged');
    case 'stale':
      return t('routeEdit.errors.stale');
    case 'not_in_route':
    case 'not_reorder':
      return t('training.errors.failed', { message: error.message });
  }
}
