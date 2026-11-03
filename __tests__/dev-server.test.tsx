import { fireEvent, render, screen } from '@testing-library/react-native';

import DevServerScreen from '@/app/dev/server';
import type { Database } from '@/db/database';
import { getKv, setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

const URL = 'http://192.168.1.10:8000/api/waypost/v1';
let db: Database;
const env = process.env.EXPO_PUBLIC_WAYPOST_API_URL;

beforeEach(async () => {
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  delete process.env.EXPO_PUBLIC_WAYPOST_API_URL;
});

afterAll(() => {
  if (env !== undefined) process.env.EXPO_PUBLIC_WAYPOST_API_URL = env;
});

async function renderScreen() {
  await render(
    <ThemeProvider>
      <DevServerScreen />
    </ThemeProvider>,
  );
}

test('stores the API address the app uses', async () => {
  await renderScreen();
  expect(screen.getByText('Nincs megadva szerver.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('API-cím'), ` ${URL}/ `);
  await fireEvent.press(screen.getByRole('button', { name: 'Mentés' }));
  expect(getKv(db, 'dev.api_base_url')).toBe(URL);
  expect(screen.getByText(`Most ezt használja: ${URL}`)).toBeOnTheScreen();
  expect(screen.getByText('Elmentve.')).toBeOnTheScreen();
});

test('refuses an address that is not http(s)', async () => {
  await renderScreen();
  await fireEvent.changeText(screen.getByLabelText('API-cím'), '192.168.1.10:8000');
  await fireEvent.press(screen.getByRole('button', { name: 'Mentés' }));
  expect(screen.getByText('Az API-cím http:// vagy https:// kezdetű legyen.')).toBeOnTheScreen();
  expect(getKv(db, 'dev.api_base_url')).toBeNull();
});

test('goes back to the address of the build', async () => {
  setKv(db, 'dev.api_base_url', URL);
  process.env.EXPO_PUBLIC_WAYPOST_API_URL = 'https://waypost.example/api/waypost/v1';
  await renderScreen();
  expect(screen.getByLabelText('API-cím')).toHaveDisplayValue(URL);
  await fireEvent.press(screen.getByRole('button', { name: 'Vissza az alapértékre' }));
  expect(getKv(db, 'dev.api_base_url')).toBeNull();
  expect(screen.getByText('Most ezt használja: https://waypost.example/api/waypost/v1')).toBeOnTheScreen();
});
