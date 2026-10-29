import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '@/theme/theme-provider';
import { palette, statusStyle } from '@/theme/tokens';

import { Card } from './card';
import { InfoBanner } from './info-banner';
import { StatusBadge } from './status-badge';
import { StatusDot, type StatusKey } from './status-dot';

test('a badge shows the status name in the status colours, or its own label', async () => {
  await render(
    <ThemeProvider initialPreference="dark">
      <StatusBadge status="incomplete" />
      <StatusBadge status="manual" label="Kézi rögzítés" />
    </ThemeProvider>,
  );
  expect(screen.getByText('Hiányos')).toHaveStyle({ color: palette.dark.warn });
  expect(screen.getByText('Kézi rögzítés')).toHaveStyle({ color: palette.dark.manual });
});

test('every status has a dot, and the dots stay out of the accessibility tree', async () => {
  await render(
    <ThemeProvider>
      {(Object.keys(statusStyle) as StatusKey[]).map((status) => (
        <StatusDot key={status} status={status} />
      ))}
      <StatusDot status="missed" filled />
      <StatusDot number={4} />
    </ThemeProvider>,
  );
  expect(screen.queryByText('4')).toBeNull();
  expect(screen.getByText('4', { includeHiddenElements: true })).toBeOnTheScreen();
});

test('a divided card puts a line between its rows only', async () => {
  await render(
    <ThemeProvider initialPreference="light">
      <Card divided>
        <Text>Menetrend</Text>
        <Text>Őrök</Text>
        <Text>Jelentések</Text>
      </Card>
    </ThemeProvider>,
  );
  const card = screen.getByText('Menetrend').parent;
  expect(card?.children).toHaveLength(5);
});

test('a banner shows its lead-in and text', async () => {
  await render(
    <ThemeProvider>
      <InfoBanner variant="offline" title="3 tétel vár feltöltésre." text="A jelentés a feltöltés után megy ki." />
    </ThemeProvider>,
  );
  expect(screen.getByText('3 tétel vár feltöltésre. A jelentés a feltöltés után megy ki.')).toBeOnTheScreen();
});
