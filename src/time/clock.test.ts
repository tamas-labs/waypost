import { getBootId, getUptimeMs } from '@modules/waypost-clock';

import { readClock } from './clock';

jest.mock('@modules/waypost-clock', () => ({ getUptimeMs: jest.fn(), getBootId: jest.fn() }));

const uptime = getUptimeMs as jest.MockedFunction<typeof getUptimeMs>;
const bootId = getBootId as jest.MockedFunction<typeof getBootId>;

afterEach(() => jest.useRealTimers());

test('reads the wall clock, the uptime and the boot ID together', () => {
  jest.useFakeTimers({ now: Date.UTC(2026, 9, 27, 21, 3, 44, 120) });
  uptime.mockReturnValue(86_400_123);
  bootId.mockReturnValue('android-boot:12');
  expect(readClock()).toEqual({ device_time: '2026-10-27T21:03:44.120Z', uptime_ms: 86_400_123, boot_id: 'android-boot:12' });
});

test('reads the boot ID only once', () => {
  bootId.mockClear();
  uptime.mockReturnValueOnce(1).mockReturnValueOnce(2);
  expect(readClock().uptime_ms).toBe(1);
  expect(readClock().uptime_ms).toBe(2);
  // The first test already read it.
  expect(bootId).not.toHaveBeenCalled();
});
