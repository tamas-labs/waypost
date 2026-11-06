import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { RootErrorBoundary as ErrorBoundary } from '@/components/root-error-boundary';
import { createTestDatabase } from '@/db/testing';
import { readErrorLog, startErrorLog } from '@/diagnostics/error-log';

it('logs a crash of the screens and offers a retry', async () => {
  const { db } = await createTestDatabase();
  const stop = startErrorLog(db);
  const retry = jest.fn(async () => {});
  await render(<ErrorBoundary error={new TypeError('Cannot read properties of undefined')} retry={retry} />);

  expect(screen.getByText('Váratlan hiba történt')).toBeOnTheScreen();
  expect(screen.getByText('Cannot read properties of undefined')).toBeOnTheScreen();
  expect(readErrorLog(db)).toEqual([
    expect.objectContaining({ source: 'render', message: 'TypeError: Cannot read properties of undefined' }),
  ]);

  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Újrapróbálás' })));
  expect(retry).toHaveBeenCalledTimes(1);
  stop();
});
