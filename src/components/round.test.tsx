import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/theme-provider';
import { palette } from '@/theme/tokens';

import { PointListItem } from './point-list-item';
import { ProgressRing, ProgressSegments } from './progress';
import { RoundTimeline, timelineLabel, type TimelineRound } from './round-timeline';
import { SyncIndicator, syncLabel } from './sync-indicator';

test('the sync chip tells the state with the waiting count', async () => {
  expect(syncLabel('synced')).toBe('Szinkronizálva');
  expect(syncLabel('offline')).toBe('Offline');
  expect(syncLabel('offline', 2)).toBe('Offline · 2 vár');
  expect(syncLabel('uploading', 3)).toBe('Feltöltés… 3');
  expect(syncLabel('error', 4)).toBe('Szinkronhiba · újra');

  const onPress = jest.fn();
  await render(
    <ThemeProvider>
      <SyncIndicator state="offline" count={2} onPress={onPress} />
      <SyncIndicator state="synced" />
    </ThemeProvider>,
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Offline · 2 vár' })));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Szinkronizálva')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Szinkronizálva' })).toBeNull();
});

test('a point row reads as name, state and meta', async () => {
  await render(
    <ThemeProvider initialPreference="dark">
      <PointListItem name="Főbejárat" state="scanned" meta="22:03 · NFC" />
      <PointListItem name="Kazánház" state="manual" meta="22:09 · Kézi – nem igazolt" />
      <PointListItem name="Tetőfeljáró" state="pending" position={4} />
      <PointListItem name="Hulladékudvar" state="missing" />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('Főbejárat, Leolvasva, 22:03 · NFC')).toBeOnTheScreen();
  expect(screen.getByLabelText('Kazánház, Nem igazolt, 22:09 · Kézi – nem igazolt')).toBeOnTheScreen();
  expect(screen.getByLabelText('Tetőfeljáró, Hátravan')).toBeOnTheScreen();
  expect(screen.getByLabelText('Hulladékudvar, Hiányzik')).toBeOnTheScreen();
  expect(screen.getByText('22:09 · Kézi – nem igazolt')).toHaveStyle({ color: palette.dark.manual });
  expect(screen.getByText('Hiányzik')).toHaveStyle({ color: palette.dark.miss });
});

test('the progress ring is a progress bar with the count', async () => {
  await render(
    <ThemeProvider>
      <ProgressRing done={5} total={9} />
      <ProgressRing done={0} total={9} size="small" />
      <ProgressSegments segments={['ok', 'manual', null]} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('progressbar', { name: '5 / 9 pont kész' })).toHaveProp('accessibilityValue', { min: 0, max: 9, now: 5 });
  expect(screen.getByRole('progressbar', { name: '0 / 9 pont kész' })).toBeOnTheScreen();
});

const NIGHT: TimelineRound[] = [
  { id: 'a', time: '20:00', state: 'completed' },
  { id: 'b', time: '21:00', state: 'incomplete' },
  { id: 'c', time: '22:00', state: 'next' },
  { id: 'd', time: '23:00', state: 'future' },
];

test('the timeline reads as the closed rounds, the next one and "the rest later"', async () => {
  expect(timelineLabel(NIGHT)).toBe('Körök idővonala: 20:00 Teljesítve, 21:00 Hiányos, 22:00 Következik, a többi később');
  expect(timelineLabel(NIGHT.slice(0, 2))).toBe('Körök idővonala: 20:00 Teljesítve, 21:00 Hiányos');
  await render(
    <ThemeProvider>
      <RoundTimeline rounds={NIGHT} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('image', { name: timelineLabel(NIGHT) })).toBeOnTheScreen();
  expect(screen.getByText('22')).toBeOnTheScreen();
});

test('a long night labels only every n-th hour; the compact timelines have no legend', async () => {
  const rounds: TimelineRound[] = Array.from({ length: 26 }, (_, i) => ({ id: String(i), time: `${String(i).padStart(2, '0')}:00`, state: 'future' }));
  await render(
    <ThemeProvider>
      <RoundTimeline rounds={rounds} />
      <RoundTimeline rounds={NIGHT} variant="compact" />
      <RoundTimeline rounds={NIGHT} variant="mini" />
    </ThemeProvider>,
  );
  expect(screen.getByText('02')).toBeOnTheScreen();
  expect(screen.queryByText('01')).toBeNull();
  expect(screen.queryAllByText('Teljesítve', { includeHiddenElements: true })).toHaveLength(1);
});
