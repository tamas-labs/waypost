import { monogram } from './account-button';

test('the monogram is the first letters of the first two words', () => {
  expect(monogram('Kovács Anna')).toBe('KA');
  expect(monogram('  éva   szabó  kiss ')).toBe('ÉS');
  expect(monogram('Ödön')).toBe('Ö');
  expect(monogram(' ')).toBe('');
});
