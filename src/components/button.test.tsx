import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/theme-provider';

import { Button } from './button';
import { IconButton } from './icon-button';

test('a button is pressed by its label', async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <Button hero icon="nfc" label="Leolvasás" onPress={onPress} />
    </ThemeProvider>,
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Leolvasás' })));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('a disabled button says so and does not react', async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <Button disabled label="Mentés" onPress={onPress} />
    </ThemeProvider>,
  );
  const button = screen.getByRole('button', { name: 'Mentés' });
  expect(button).toBeDisabled();
  await act(async () => fireEvent.press(button));
  expect(onPress).not.toHaveBeenCalled();
});

test('every variant renders its label', async () => {
  await render(
    <ThemeProvider>
      <Button variant="secondary" label="Mégse" onPress={() => {}} />
      <Button variant="dashed" label="Hozzáadás" onPress={() => {}} />
      <Button variant="dangerText" label="Pont elvetése" onPress={() => {}} />
      <Button variant="warnTonal" label="Javítás" onPress={() => {}} />
    </ThemeProvider>,
  );
  for (const name of ['Mégse', 'Hozzáadás', 'Pont elvetése', 'Javítás']) expect(screen.getByRole('button', { name })).toBeOnTheScreen();
});

test('an icon button is found by its accessibility label', async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <IconButton size="large" icon="flag" iconColor="warn" accessibilityLabel="Esemény rögzítése" onPress={onPress} />
    </ThemeProvider>,
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Esemény rögzítése' })));
  expect(onPress).toHaveBeenCalledTimes(1);
});
