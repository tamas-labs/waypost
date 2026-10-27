import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { resolveThemeName, ThemeProvider, useTheme } from '@/theme/theme-provider';

function ThemeName() {
  return <Text testID="name">{useTheme().name}</Text>;
}

test('dark unless light is chosen or the system is light', () => {
  expect(resolveThemeName('system', 'dark')).toBe('dark');
  expect(resolveThemeName('system', null)).toBe('dark');
  expect(resolveThemeName('system', 'light')).toBe('light');
  expect(resolveThemeName('dark', 'light')).toBe('dark');
  expect(resolveThemeName('light', 'dark')).toBe('light');
});

test('the provider gives the chosen theme', async () => {
  await render(
    <ThemeProvider initialPreference="light">
      <ThemeName />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('name')).toHaveTextContent('light');
});

test('useTheme() outside the provider throws', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(render(<ThemeName />)).rejects.toThrow('useTheme() must be used inside <ThemeProvider>');
});
