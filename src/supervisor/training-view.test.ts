import { TrainingError, type TrainingDraft, type TrainingPoint } from '@/domain/training';

import { elapsedText, gpsText, pointMeta, routeTitle, trainingErrorText, walkText } from './training-view';

const scanned = { uptime_ms: 0, boot_id: 'android-boot:12' };
const NEW: TrainingPoint = {
  kind: 'new',
  checkpoint_id: 'c1',
  tag_uid: '04A1',
  name: 'Hátsó kapu',
  instruction: 'Zárva van?',
  photo: null,
  location: { lat_e7: 474979000, lng_e7: 190402000, accuracy_dm: 42 },
  scanned,
};
const EXISTING: TrainingPoint = { kind: 'existing', checkpoint_id: 'c2', name: 'Raktár', active: false, scanned };
const DRAFT: TrainingDraft = {
  site_id: 's1',
  supervisor_id: 'u1',
  route: { id: 'r1', name: '  ', order_mode: 'free' },
  saved_order_mode: null,
  started: scanned,
  points: [NEW, EXISTING],
};

it('counts the elapsed time in minutes and seconds, with the hours above an hour', () => {
  expect(elapsedText(0)).toBe('00:00');
  expect(elapsedText(402_900)).toBe('06:42');
  expect(elapsedText(3_962_000)).toBe('1:06:02');
  expect(elapsedText(null)).toBe('–');
});

it('tells the walk from the previous point', () => {
  expect(walkText(null, 0)).toBe('start');
  expect(walkText(95, 1)).toBe('+1:35');
  expect(walkText(null, 2)).toBe('–');
});

it('tells what a point has', () => {
  expect(pointMeta(NEW)).toBe('NFC · utasítás · GPS ±4 m');
  const photo = {
    id: 'p1',
    sha256: 'a'.repeat(64),
    mime: 'image/jpeg',
    size_bytes: 1,
    local_uri: 'file:///p1.jpg',
    taken_at: '2026-11-03T10:00:00.000Z',
  };
  expect(pointMeta({ ...NEW, photo })).toBe('NFC · fotó · utasítás · GPS ±4 m');
  expect(pointMeta({ ...NEW, instruction: null, location: { lat_e7: null, lng_e7: null, accuracy_dm: null } })).toBe('NFC · GPS nélkül');
  expect(pointMeta(EXISTING)).toBe('Meglévő pont · kikapcsolva');
  expect(pointMeta({ ...EXISTING, active: true })).toBe('Meglévő pont');
  expect(gpsText({ lat_e7: 1, lng_e7: 1, accuracy_dm: 2 })).toBe('GPS ±1 m');
});

it('names a new route until it has a name', () => {
  expect(routeTitle(DRAFT)).toBe('Új útvonal');
  expect(routeTitle({ ...DRAFT, route: { ...DRAFT.route, name: 'Hétvégi kör' } })).toBe('Hétvégi kör');
});

it('tells why the save cannot go on', () => {
  expect(trainingErrorText(new TrainingError('tag_taken', 'taken', ['c1']), DRAFT)).toBe(
    'Ezeknek a pontoknak a címkéje közben egy másik ponthoz került a telephelyen: „Hátsó kapu”. Vedd ki őket a bejárásból, és olvass le helyettük másik címkét.',
  );
  expect(trainingErrorText(new TrainingError('no_points', 'none'), DRAFT)).toBe('Még nincs rögzített pont.');
  expect(trainingErrorText(new TrainingError('too_many_points', 'many'), DRAFT)).toBe('Egy útvonalon legfeljebb 500 pont lehet.');
  expect(trainingErrorText(new TrainingError('route_name_required', 'name'), DRAFT)).toBe('Add meg az útvonal nevét.');
  expect(trainingErrorText(new TrainingError('name_required', 'name'), DRAFT)).toBe('Add meg a pont nevét.');
  expect(trainingErrorText(new TrainingError('in_draft', 'twice'), DRAFT)).toBe('Ez a pont már a bejárásban van.');
  expect(trainingErrorText(new TrainingError('not_new', 'Only a new one'), DRAFT)).toBe('A mentés nem sikerült: Only a new one');
  expect(trainingErrorText(new Error('Route r1 is not on the phone any more'), DRAFT)).toBe(
    'A mentés nem sikerült: Route r1 is not on the phone any more',
  );
  expect(trainingErrorText('disk full', DRAFT)).toBe('A mentés nem sikerült: disk full');
});
