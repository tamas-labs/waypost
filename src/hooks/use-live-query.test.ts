import { act, renderHook } from '@testing-library/react-native';

import { emitChainEntries } from '@/chain/events';
import { emitConfigurationPulled, emitOutboxQueued, type PullSummary } from '@/sync/events';

import { useLiveQuery } from './use-live-query';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function counter() {
  let loads = 0;
  return () => (loads += 1);
}

it('reloads after a chain entry, a pull and a supervisor action, until it unmounts', async () => {
  const load = counter();
  const { result, unmount } = await renderHook(() => useLiveQuery(load));
  const first = result.current;
  await act(async () => emitChainEntries([]));
  expect(result.current).toBe(first + 1);
  await act(async () => emitConfigurationPulled({} as PullSummary));
  expect(result.current).toBe(first + 2);
  await act(async () => emitOutboxQueued());
  expect(result.current).toBe(first + 3);
  await unmount();
  const loaded = load();
  emitChainEntries([]);
  expect(load()).toBe(loaded + 1);
});

it('reloads at the interval if it has one', async () => {
  const load = counter();
  const { result } = await renderHook(() => useLiveQuery(load, 30_000));
  const first = result.current;
  await act(async () => jest.advanceTimersByTime(29_999));
  expect(result.current).toBe(first);
  await act(async () => jest.advanceTimersByTime(1));
  expect(result.current).toBe(first + 1);
});
