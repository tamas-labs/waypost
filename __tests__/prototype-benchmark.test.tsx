import { render, screen, userEvent } from '@testing-library/react-native';

import BenchmarkScreen from '@/app/prototype/benchmark';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

test('shows the times of the rules after a run', async () => {
  await render(
    <ThemeProvider>
      <BenchmarkScreen />
    </ThemeProvider>,
  );
  expect(screen.queryByText('schedulerStep')).toBeNull();
  await userEvent.setup().press(screen.getByRole('button', { name: 'Mérés indítása' }));
  expect(screen.getByText('5 percenként, 00:00–23:55')).toBeOnTheScreen();
  expect(screen.getAllByText('schedulerStep')).toHaveLength(3);
  expect(screen.getAllByText('slotsBetween')).toHaveLength(3);
});
