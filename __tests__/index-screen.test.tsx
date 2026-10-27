import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

test('the start screen renders', async () => {
  await render(<Index />);
  expect(screen.getByText('Waypost')).toBeOnTheScreen();
});
