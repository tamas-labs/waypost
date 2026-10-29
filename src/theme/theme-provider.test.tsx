import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { resolveThemeName, ThemeProvider, useTheme, useThemePreference } from '@/theme/theme-provider';

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

function ChooseLight() {
  const { setPreference } = useThemePreference();
  return <Pressable testID="light" onPress={() => setPreference('light')} />;
}

test('a new choice switches the theme and is handed over for storing', async () => {
  const onPreferenceChange = jest.fn();
  await render(
    <ThemeProvider initialPreference="dark" onPreferenceChange={onPreferenceChange}>
      <ThemeName />
      <ChooseLight />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('name')).toHaveTextContent('dark');
  await act(async () => fireEvent.press(screen.getByTestId('light')));
  expect(screen.getByTestId('name')).toHaveTextContent('light');
  expect(onPreferenceChange).toHaveBeenCalledWith('light');
});

test('useTheme() outside the provider throws', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(render(<ThemeName />)).rejects.toThrow('useTheme() must be used inside <ThemeProvider>');
});
