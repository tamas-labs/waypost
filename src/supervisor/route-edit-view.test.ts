import { beginRouteEdit, RouteEditError, setEditOrderMode, type RouteEditBase } from '@/domain/route-edit';

import { editHeaderLine, editPointMeta, routeEditErrorText } from './route-edit-view';

const base: RouteEditBase = {
  route: { id: 'route', site_id: 'site', name: 'Éjszakai kör', order_mode: 'free' },
  version_id: 'version',
  version: 4,
  walk_duration_s: 120,
  points: [
    { checkpoint_id: 'a', name: 'Főbejárat', tag_type: 'nfc', instruction: null, photo_media_id: null, walk_time_from_prev_s: null },
  ],
};

describe('the texts of the route editing', () => {
  it('tell the version edited and the order as it is now', () => {
    expect(editHeaderLine(beginRouteEdit(base))).toBe('v4 szerkesztése · szabad sorrend');
    expect(editHeaderLine(setEditOrderMode(beginRouteEdit(base), 'fixed'))).toBe('v4 szerkesztése · kötött sorrend');
  });

  it('give how a point is scanned and what it has', () => {
    const point = { checkpoint_id: 'a', name: 'Főbejárat', instruction: null, photo: null };
    expect(editPointMeta(point, 'nfc')).toBe('NFC');
    expect(editPointMeta(point, 'nfc_dna')).toBe('NFC');
    expect(editPointMeta({ ...point, instruction: 'Zárva?', photo: { kind: 'saved', media_id: 'm' } }, 'qr')).toBe('QR · fotó · utasítás');
  });

  it('tell why the save cannot go on', () => {
    expect(routeEditErrorText(new RouteEditError('stale', 'x'))).toBe(
      'Közben új verzió készült, ezért ez a szerkesztés nem menthető. Kezdd újra az új verzióból.',
    );
    expect(routeEditErrorText(new RouteEditError('no_points', 'x'))).toBe('Egy útvonalon legalább egy pontnak kell lennie.');
    expect(routeEditErrorText(new Error('disk full'))).toBe('A mentés nem sikerült: disk full');
  });
});
