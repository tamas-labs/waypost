import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { getDatabase } from '@/db/open';
import { createTestDatabase } from '@/db/testing';
import type { TagRead } from '@/domain/scan';
import { guardState } from '@/domain/testing';
import { playFeedback } from '@/feedback/feedback';
import * as guardScan from '@/guard/scan';
import { seedSite } from '@/guard/testing';
import { currentLocation } from '@/location/location';

import { useScanRecorder } from './use-scan-recorder';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: () => 5_000_000, getBootId: () => 'android-boot:12' }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/feedback/feedback', () => ({ playFeedback: jest.fn() }));
jest.mock('@/location/location', () => ({ currentLocation: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const KNOWN: TagRead = { method: 'nfc', tag_uid: guardState().checkpoints[0]!.tag_uid!, ndef_raw: null };
const UNKNOWN: TagRead = { method: 'nfc', tag_uid: 'FFFFFFFF', ndef_raw: null };

async function recorder() {
  const { result } = await renderHook(() => useScanRecorder('push', 'round-1'));
  return result;
}

beforeEach(async () => {
  const { db } = await createTestDatabase();
  await seedSite(db);
  jest.mocked(getDatabase).mockReturnValue(db);
  jest.mocked(playFeedback).mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(currentLocation).mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

it('gives the feedback at once, while the location is still coming', async () => {
  jest.mocked(currentLocation).mockReturnValue(new Promise(() => undefined));
  const result = await recorder();
  await act(async () => {
    void result.current.record(KNOWN);
  });
  expect(playFeedback).toHaveBeenCalledTimes(1);
  expect(playFeedback).toHaveBeenCalledWith('warning');
  expect(router.push).not.toHaveBeenCalled();
});

it('gives it once, and goes on to the result', async () => {
  const result = await recorder();
  await act(() => result.current.record(UNKNOWN));
  expect(jest.mocked(playFeedback).mock.calls).toEqual([['error']]);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/scan-result', params: expect.objectContaining({ kind: 'unknown_tag' }) });
});

it('corrects the feedback if the recording came to something else', async () => {
  jest.spyOn(guardScan, 'recordTagRead').mockResolvedValue({ kind: 'unknown_tag', drafts: [] });
  const result = await recorder();
  await act(() => result.current.record(KNOWN));
  expect(jest.mocked(playFeedback).mock.calls).toEqual([['warning'], ['error']]);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/scan-result', params: expect.objectContaining({ kind: 'unknown_tag' }) });
});

it('tells a failed recording', async () => {
  jest.spyOn(guardScan, 'recordTagRead').mockRejectedValue(new Error('Disk full'));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  const result = await recorder();
  await act(() => result.current.record(KNOWN));
  expect(jest.mocked(playFeedback).mock.calls).toEqual([['warning'], ['error']]);
  expect(result.current.failed).toBe(true);
  expect(router.push).not.toHaveBeenCalled();
});
