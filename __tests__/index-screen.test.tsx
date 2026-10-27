import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';
import { ThemeProvider } from '@/theme/theme-provider';

test('the start screen shows the app name', async () => {
  await render(
    <ThemeProvider>
      <Index />
    </ThemeProvider>,
  );
  expect(screen.getByText('Waypost')).toBeOnTheScreen();
});
