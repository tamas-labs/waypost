import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';

import { enrollErrorText } from './enroll-error';
import { UnsentActionsError } from './supervisor';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));

test.each<[string, unknown, string]>([
  [
    'unsent actions',
    new UnsentActionsError(3),
    '3 módosítás még nem jutott el a szerverre. A hozzárendelés előtt el kell küldeni őket: ellenőrizd a kapcsolatot, és próbáld újra.',
  ],
  ['no network', new NetworkError(false), 'A szerver nem érhető el. Ellenőrizd az internetkapcsolatot, és próbáld újra.'],
  ['a timeout', new NetworkError(true), 'A szerver nem válaszolt időben. Próbáld újra.'],
  ['a response against the contract', new InvalidResponseError(200, 'not JSON'), 'A szerver váratlan választ adott. Próbáld újra később.'],
  [
    'a token not accepted',
    new ApiError(401, 'unauthenticated', 'Nem vagy bejelentkezve.'),
    'A fiókod belépése már nem érvényes. Jelentkezz ki, és lépj be újra.',
  ],
  ['a server error', new ApiError(500, 'server_error', 'SQLSTATE'), 'Szerverhiba. Próbáld újra később.'],
  ['a proxy page', new ApiError(404, 'not_found', 'HTTP 404', null, null, false), 'Szerverhiba. Próbáld újra később.'],
  ['a refusal of the server', new ApiError(403, 'forbidden', 'Ez nem a te telephelyed.'), 'Ez nem a te telephelyed.'],
  ['anything else', new Error('boom'), 'A hozzárendelés nem sikerült: boom'],
])('tells about %s', (_name, error, text) => {
  expect(enrollErrorText(error)).toBe(text);
});
