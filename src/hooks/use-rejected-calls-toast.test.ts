import { act, renderHook } from '@testing-library/react-native';

import * as toast from '@/components/toast';
import type { OutboxRejection } from '@/db/kv';
import { useSyncStatus } from '@/sync/status';

import { useRejectedCallsToast } from './use-rejected-calls-toast';

const rejection = (message: string): OutboxRejection => ({
  call_id: message,
  method: 'POST',
  path: '/checkpoints',
  status: 409,
  code: 'conflict',
  message,
  details: null,
  at: '2026-10-27T21:00:00.000Z',
});

it('tells each new refusal once, several of them by their count, and nothing after it unmounts', async () => {
  const showToast = jest.spyOn(toast, 'showToast').mockImplementation(() => {});
  useSyncStatus.setState({ rejectedCalls: [rejection('Régi.')] });
  const { unmount } = await renderHook(() => useRejectedCallsToast());
  expect(showToast).not.toHaveBeenCalled();

  await act(async () => useSyncStatus.setState({ rejectedCalls: [rejection('Régi.'), rejection('Foglalt címke.')] }));
  expect(showToast).toHaveBeenLastCalledWith('A szerver nem fogadta el a módosítást: Foglalt címke.', 'warn');

  await act(async () => useSyncStatus.setState({ rejectedCalls: [rejection('a'), rejection('b'), rejection('c'), rejection('d')] }));
  expect(showToast).toHaveBeenLastCalledWith('2 módosítást nem fogadott el a szerver.', 'warn');

  await act(async () => useSyncStatus.setState({ rejectedCalls: [] }));
  await unmount();
  useSyncStatus.setState({ rejectedCalls: [rejection('Később.')] });
  expect(showToast).toHaveBeenCalledTimes(2);
  showToast.mockRestore();
});
