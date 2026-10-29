import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme/theme-provider';

import { Button } from './button';
import { CategoryTile } from './category-tile';
import { PhotoAdd, PhotoSlot } from './photo-tile';
import { ResultScreen } from './result-screen';

test('category tiles are radios', async () => {
  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <CategoryTile icon="door" label="Nyitott ajtó / ablak" selected onPress={() => {}} />
      <CategoryTile icon="more" label="Egyéb" selected={false} wide onPress={onPress} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('radio', { name: 'Nyitott ajtó / ablak' })).toBeChecked();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Egyéb' })));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('photo tiles: numbered photos and the add button', async () => {
  const onRemove = jest.fn();
  const onAdd = jest.fn();
  await render(
    <ThemeProvider>
      <PhotoSlot uri="file:///media/a.jpg" number={1} />
      <PhotoSlot uri="file:///media/b.jpg" number={2} onPress={onRemove} />
      <PhotoAdd onPress={onAdd} />
      <PhotoAdd disabled onPress={onAdd} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('image', { name: '1. fotó' })).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '2. fotó' })));
  expect(onRemove).toHaveBeenCalledTimes(1);
  const [enabled, disabled] = screen.getAllByRole('button', { name: 'Fotó készítése' });
  await act(async () => fireEvent.press(enabled!));
  await act(async () => fireEvent.press(disabled!));
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('the result screen shows status line, title, body, content and actions', async () => {
  const onNext = jest.fn();
  // Test metrics: no safe area measurement in Jest.
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <ResultScreen
          tone="miss"
          icon="x"
          statusLine="Nem rögzítettük"
          title="Ismeretlen címke"
          body="Ez a címke nem tartozik ehhez az útvonalhoz."
          actions={<Button hero label="Újra próbálom" onPress={onNext} />}
        >
          <Text>NFC · 04:A2:19</Text>
        </ResultScreen>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  expect(screen.getByRole('header', { name: 'Ismeretlen címke' })).toBeOnTheScreen();
  expect(screen.getByText('Nem rögzítettük')).toBeOnTheScreen();
  expect(screen.getByText('NFC · 04:A2:19')).toBeOnTheScreen();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Újra próbálom' })));
  expect(onNext).toHaveBeenCalledTimes(1);
});
