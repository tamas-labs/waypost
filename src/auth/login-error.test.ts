import { ApiError, InvalidResponseError, NetworkError } from '@/api/errors';

import { checkLoginForm, loginError } from './login-error';

describe('checkLoginForm', () => {
  it('passes an address and a password', () => {
    expect(checkLoginForm('nagy.anna@example.com', 'titkos')).toBeNull();
  });

  it('asks for both fields', () => {
    expect(checkLoginForm('', '')).toEqual({
      message: null,
      fields: { email: 'Add meg az e-mail-címedet.', password: 'Add meg a jelszavadat.' },
    });
  });

  it.each(['nagy.anna', 'nagy anna@example.com', 'anna@example', '@example.com'])('refuses the address %j', (email) => {
    expect(checkLoginForm(email, 'titkos')).toEqual({ message: null, fields: { email: 'Ez nem érvényes e-mail-cím.' } });
  });
});

describe('loginError', () => {
  it("shows the server's message of a refused login (a wrong password or an inactive account)", () => {
    expect(loginError(new ApiError(401, 'unauthenticated', 'Ez a fiók inaktív, nem lehet vele belépni.'))).toEqual({
      message: 'Ez a fiók inaktív, nem lehet vele belépni.',
      fields: {},
    });
    expect(loginError(new ApiError(401, 'unauthenticated', 'HTTP 401', null, null, false)).message).toBe('Hibás e-mail-cím vagy jelszó.');
  });

  it('tells when to try again after too many attempts', () => {
    expect(loginError(new ApiError(429, 'rate_limited', 'Too Many Attempts.', null, 42)).message).toBe(
      'Túl sok sikertelen próbálkozás. Próbáld újra egy perc múlva.',
    );
    expect(loginError(new ApiError(429, 'rate_limited', 'Too Many Attempts.', null, null)).message).toBe(
      'Túl sok sikertelen próbálkozás. Próbáld újra egy perc múlva.',
    );
    expect(loginError(new ApiError(429, 'rate_limited', 'Too Many Attempts.', null, 150)).message).toBe(
      'Túl sok sikertelen próbálkozás. Próbáld újra 3 perc múlva.',
    );
  });

  it('puts the validation messages under their fields', () => {
    const error = new ApiError(422, 'validation_failed', 'Hibás adatok.', { email: ['Ez nem érvényes e-mail-cím.'] });
    expect(loginError(error)).toEqual({ message: null, fields: { email: 'Ez nem érvényes e-mail-cím.' } });
  });

  it("keeps the server's message when a field the form does not show is wrong", () => {
    const error = new ApiError(422, 'validation_failed', 'Hibás adatok.', {
      password: ['Túl hosszú.'],
      device_name: ['Kötelező.'],
    });
    expect(loginError(error)).toEqual({ message: 'Hibás adatok.', fields: { password: 'Túl hosszú.' } });
    expect(loginError(new ApiError(422, 'validation_failed', 'Hibás adatok.'))).toEqual({ message: 'Hibás adatok.', fields: {} });
  });

  it('tells a network failure from a timeout', () => {
    expect(loginError(new NetworkError(false)).message).toBe(
      'A szerver nem érhető el. Ellenőrizd az internetkapcsolatot, és próbáld újra.',
    );
    expect(loginError(new NetworkError(true)).message).toBe('A szerver nem válaszolt időben. Próbáld újra.');
  });

  it('does not show the internals of a server error', () => {
    expect(loginError(new ApiError(500, 'server_error', 'SQLSTATE[HY000]')).message).toBe('Szerverhiba. Próbáld újra később.');
    expect(loginError(new ApiError(404, 'not_found', 'HTTP 404', null, null, false)).message).toBe('Szerverhiba. Próbáld újra később.');
    expect(loginError(new ApiError(403, 'forbidden', 'Nincs jogosultság.')).message).toBe('Nincs jogosultság.');
    expect(loginError(new InvalidResponseError(200, 'not JSON')).message).toBe('A szerver váratlan választ adott. Próbáld újra később.');
  });

  it('shows any other error with its message', () => {
    expect(loginError(new Error('boom')).message).toBe('A belépés nem sikerült: boom');
    expect(loginError('boom').message).toBe('A belépés nem sikerült: boom');
  });
});
