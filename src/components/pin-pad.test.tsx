import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/theme-provider';

import { PinDots, PinPad } from './pin-pad';

test('the keys hand over digits, delete and the supervisor login', async () => {
  const onDigit = jest.fn();
  const onDelete = jest.fn();
  const onSupervisor = jest.fn();
  await render(
    <ThemeProvider>
      <PinPad onDigit={onDigit} onDelete={onDelete} onSupervisor={onSupervisor} />
    </ThemeProvider>,
  );
  for (const digit of ['1', '5', '9', '0']) await act(async () => fireEvent.press(screen.getByRole('button', { name: digit })));
  expect(onDigit.mock.calls.map(([digit]) => digit)).toEqual(['1', '5', '9', '0']);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Törlés' })));
  expect(onDelete).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Supervisor mód' })));
  expect(onSupervisor).toHaveBeenCalledTimes(1);
});

test('a locked keypad takes no digits; without a supervisor handler there is no shield key', async () => {
  const onDigit = jest.fn();
  await render(
    <ThemeProvider>
      <PinPad disabled onDigit={onDigit} onDelete={() => {}} />
    </ThemeProvider>,
  );
  await act(async () => fireEvent.press(screen.getByRole('button', { name: '7' })));
  expect(onDigit).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Supervisor mód' })).toBeNull();
});

test('the dots tell how many digits are entered, and survive a shake', async () => {
  const { rerender } = await render(
    <ThemeProvider>
      <PinDots entered={3} />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('3 számjegy megadva a 6-ból')).toBeOnTheScreen();
  await rerender(
    <ThemeProvider>
      <PinDots entered={0} shakeKey={1} />
    </ThemeProvider>,
  );
  expect(screen.getByLabelText('0 számjegy megadva a 6-ból')).toBeOnTheScreen();
});
