import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/theme-provider';
import { palette } from '@/theme/tokens';

import { TextArea, TextField } from './text-field';

test('the label names the field, with the requirement', async () => {
  await render(
    <ThemeProvider>
      <TextField label="E-mail-cím" requirement="required" value="" onChangeText={() => {}} />
      <TextArea label="Megjegyzés" requirement="optional" value="" onChangeText={() => {}} />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('E-mail-cím, kötelező')).toBeOnTheScreen();
  expect(screen.getByLabelText('Megjegyzés, nem kötelező')).toBeOnTheScreen();
  expect(screen.getByText(' · kötelező')).toBeOnTheScreen();
});

test('typing reaches the owner, and focus gives an accent border', async () => {
  const onChangeText = jest.fn();
  await render(
    <ThemeProvider initialPreference="dark">
      <TextField label="Név" value="" onChangeText={onChangeText} />
    </ThemeProvider>,
  );
  const input = screen.getByLabelText('Név');
  await act(async () => fireEvent.changeText(input, 'Anna'));
  expect(onChangeText).toHaveBeenCalledWith('Anna');
  await act(async () => fireEvent(input, 'focus'));
  expect(input.parent).toHaveStyle({ borderColor: palette.dark.accent, borderWidth: 2 });
  await act(async () => fireEvent(input, 'blur'));
  expect(input.parent).toHaveStyle({ borderWidth: 1 });
});

test('a secret field is hidden until the eye button shows it', async () => {
  await render(
    <ThemeProvider>
      <TextField label="Jelszó" secret value="titok" onChangeText={() => {}} />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('Jelszó')).toHaveProp('secureTextEntry', true);
  await act(async () => fireEvent.press(screen.getByRole('togglebutton', { name: 'Jelszó megjelenítése' })));
  expect(screen.getByLabelText('Jelszó')).toHaveProp('secureTextEntry', false);
  expect(screen.getByRole('togglebutton', { name: 'Jelszó megjelenítése' })).toHaveProp('accessibilityState', { checked: true });
});

test('an error shows under the field', async () => {
  await render(
    <ThemeProvider>
      <TextField label="Név" value="" onChangeText={() => {}} error="Ez a mező kötelező." />
    </ThemeProvider>,
  );
  expect(screen.getByText('Ez a mező kötelező.')).toBeOnTheScreen();
});
