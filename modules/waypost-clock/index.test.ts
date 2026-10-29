import { getBootId, getGnssTimeMs, getUptimeMs } from './index';
import WaypostClock from './src/WaypostClockModule';

jest.mock('./src/WaypostClockModule', () => ({
  __esModule: true,
  default: { getUptimeMs: jest.fn(), getBootId: jest.fn(), getGnssTimeMs: jest.fn() },
}));

const native = WaypostClock as jest.Mocked<typeof WaypostClock>;

test('passes through a valid uptime and boot ID', () => {
  native.getUptimeMs.mockReturnValue(86_400_123);
  native.getBootId.mockReturnValue('ios-session:3f1c2b9a-0d4e-4f6a-9b8c-7d6e5f4a3b2c');
  expect(getUptimeMs()).toBe(86_400_123);
  expect(getBootId()).toBe('ios-session:3f1c2b9a-0d4e-4f6a-9b8c-7d6e5f4a3b2c');
});

test('rejects values a chain entry could not carry', () => {
  for (const bad of [-1, 1.5, Number.NaN, 2 ** 53]) {
    native.getUptimeMs.mockReturnValue(bad);
    expect(() => getUptimeMs()).toThrow('waypost-clock: invalid uptime');
  }
  for (const bad of ['', 'boot id with spaces', 'x'.repeat(65)]) {
    native.getBootId.mockReturnValue(bad);
    expect(() => getBootId()).toThrow('waypost-clock: invalid boot ID');
  }
});

test('passes through the GNSS time of a recent GPS fix, or null', () => {
  native.getGnssTimeMs.mockReturnValue(1_793_738_623_000);
  expect(getGnssTimeMs(60_000)).toBe(1_793_738_623_000);
  expect(native.getGnssTimeMs).toHaveBeenCalledWith(60_000);
  native.getGnssTimeMs.mockReturnValue(null);
  expect(getGnssTimeMs(60_000)).toBeNull();
  native.getGnssTimeMs.mockReturnValue(1.5);
  expect(() => getGnssTimeMs(60_000)).toThrow('waypost-clock: invalid GNSS time');
});
