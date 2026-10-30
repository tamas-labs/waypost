import { getGnssTimeMs } from '@modules/waypost-clock';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { currentLocation, LAST_KNOWN_MAX_AGE_MS, LOCATION_TIMEOUT_MS, watchPosition } from './location';

jest.mock('@modules/waypost-clock', () => ({ getGnssTimeMs: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

const native = jest.mocked(Location);
const gnss = jest.mocked(getGnssTimeMs);

const fix = (latitude: number, mocked = false): Location.LocationObject => ({
  coords: { latitude, longitude: 19.0402, accuracy: 4.2, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: 0,
  mocked,
});

/** Settles currentLocation() while the fake clock runs, and tells how long it took. */
async function locate() {
  const start = Date.now();
  const promise = currentLocation();
  await jest.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS + 1000);
  return { location: await promise, waitedMs: Date.now() - start };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  native.getForegroundPermissionsAsync.mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  native.getLastKnownPositionAsync.mockResolvedValue(null);
  native.getCurrentPositionAsync.mockImplementation(() => new Promise(() => {}));
  gnss.mockReturnValue(null);
  Platform.OS = 'android';
});

afterEach(() => jest.useRealTimers());

describe('location of a scan', () => {
  it('uses the last known position of the last 60 s without asking for a new one', async () => {
    native.getLastKnownPositionAsync.mockResolvedValue(fix(47.4979));
    const location = await currentLocation();
    expect(native.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    expect(native.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(location).toEqual({ latitude: 47.4979, longitude: 19.0402, accuracy_m: 4.2, mocked: false, gnss_time: null });
  });

  it('asks for a new fix without a recent one, and takes it if it comes within 5 s', async () => {
    native.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(fix(47.5)), LOCATION_TIMEOUT_MS - 100)));
    const { location } = await locate();
    expect(native.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High });
    expect(location?.latitude).toBe(47.5);
  });

  it('records without a location after 5 s, and ignores a fix coming later', async () => {
    native.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(fix(47.5)), LOCATION_TIMEOUT_MS + 100)));
    const { location, waitedMs } = await locate();
    expect(location).toBeNull();
    expect(waitedMs).toBeLessThanOrEqual(LOCATION_TIMEOUT_MS + 1000);
  });

  it('counts the 5 s from the start, also when the last known position is slow to come', async () => {
    native.getLastKnownPositionAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(null), 4000)));
    native.getCurrentPositionAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(fix(47.5)), 2000)));
    const promise = currentLocation();
    await jest.advanceTimersByTimeAsync(LOCATION_TIMEOUT_MS);
    await expect(promise).resolves.toBeNull();
  });

  it('records without a location, at once, without permission or on an error', async () => {
    native.getForegroundPermissionsAsync.mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
    await expect(currentLocation()).resolves.toBeNull();
    expect(native.getLastKnownPositionAsync).not.toHaveBeenCalled();

    native.getForegroundPermissionsAsync.mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
    native.getCurrentPositionAsync.mockRejectedValue(new Error('Location services are disabled'));
    await expect(currentLocation()).resolves.toBeNull();
  });

  it('marks a mock location, and gives the GNSS time of a recent GPS fix on Android only', async () => {
    native.getLastKnownPositionAsync.mockResolvedValue(fix(47.4979));
    gnss.mockReturnValue(Date.parse('2026-11-03T20:03:43.000Z'));
    expect((await currentLocation())?.gnss_time).toBe('2026-11-03T20:03:43.000Z');
    expect(gnss).toHaveBeenCalledWith(LAST_KNOWN_MAX_AGE_MS);

    native.getLastKnownPositionAsync.mockResolvedValue(fix(47.4979, true));
    expect(await currentLocation()).toMatchObject({ mocked: true, gnss_time: null });

    gnss.mockImplementation(() => {
      throw new Error('waypost-clock: invalid GNSS time 1.5');
    });
    native.getLastKnownPositionAsync.mockResolvedValue(fix(47.4979));
    expect(await currentLocation()).toMatchObject({ latitude: 47.4979, gnss_time: null });

    Platform.OS = 'ios';
    gnss.mockReset();
    expect((await currentLocation())?.gnss_time).toBeNull();
    expect(gnss).not.toHaveBeenCalled();
  });
});

describe('following the position', () => {
  const remove = jest.fn();
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  beforeEach(() => {
    jest.useRealTimers();
    remove.mockClear();
    native.watchPositionAsync.mockReset();
    native.getForegroundPermissionsAsync.mockResolvedValue({ granted: true } as Location.LocationPermissionResponse);
  });

  it('reports the position until it is stopped', async () => {
    native.watchPositionAsync.mockImplementation(async (_options, callback) => {
      void callback(fix(47.5));
      return { remove };
    });
    const onPosition = jest.fn();
    const stop = watchPosition(onPosition);
    await settle();
    expect(onPosition).toHaveBeenCalledWith({ latitude: 47.5, longitude: 19.0402 });
    expect(remove).not.toHaveBeenCalled();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops a watch that starts after it was stopped', async () => {
    native.watchPositionAsync.mockResolvedValue({ remove });
    const stop = watchPosition(jest.fn());
    stop();
    await settle();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('never asks for the permission, and reports nothing without it', async () => {
    native.getForegroundPermissionsAsync.mockResolvedValue({ granted: false } as Location.LocationPermissionResponse);
    watchPosition(jest.fn());
    await settle();
    expect(native.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(native.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('survives an error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    native.watchPositionAsync.mockRejectedValue(new Error('location off'));
    const onPosition = jest.fn();
    expect(() => watchPosition(onPosition)()).not.toThrow();
    await settle();
    expect(onPosition).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
