// The location of a scan or an incident (specification: Állapotgépek / Leolvasás 6). The scan does not wait for the
// GPS: the last known position if it is at most 60 s old, otherwise a new fix for at most 5 s, otherwise no
// location. Foreground only; the app never asks for the location in the background.
import { getGnssTimeMs } from '@modules/waypost-clock';
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
  watchPositionAsync,
  type LocationObject,
} from 'expo-location';
import { Platform } from 'react-native';

import type { LocationFix } from '@/chain/payloads';
import { toTimestamp } from '@/time/timestamp';

import type { Coordinate } from './coordinate';

/** A last known position up to this age is used as it is. */
export const LAST_KNOWN_MAX_AGE_MS = 60_000;
/** The longest a scan waits for its location, all steps included. */
export const LOCATION_TIMEOUT_MS = 5_000;
/** The position on a map moves after this much. */
const WATCH_DISTANCE_M = 3;

/** Whether the app may read the location (in the foreground). */
export async function hasLocationPermission(): Promise<boolean> {
  return (await getForegroundPermissionsAsync()).granted;
}

/** The foreground permission, and whether the system still shows its request (if not, only the app's settings can grant it). */
export async function getLocationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const { granted, canAskAgain } = await getForegroundPermissionsAsync();
  return { granted, canAskAgain };
}

/** Asks for the foreground location permission; never asked during a scan. */
export async function requestLocationPermission(): Promise<boolean> {
  return (await requestForegroundPermissionsAsync()).granted;
}

/** A GNSS time that cannot be read only leaves gnss_time null: the location itself is kept. */
function readGnssTimeMs(): number | null {
  try {
    return getGnssTimeMs(LAST_KNOWN_MAX_AGE_MS);
  } catch {
    return null;
  }
}

/**
 * The fix as the chain records it. gnss_time: Android, the time of a GPS fix of the last 60 s – the system tells
 * no provider for the fix it hands over, so the GPS provider's own last fix stands for it. A mock location has none:
 * its time is whatever the mock provider says.
 */
function toFix(location: LocationObject): LocationFix {
  const mocked = location.mocked === true;
  const gnssMs = Platform.OS === 'android' && !mocked ? readGnssTimeMs() : null;
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_m: location.coords.accuracy,
    mocked,
    gnss_time: gnssMs === null ? null : toTimestamp(gnssMs),
  };
}

async function locate(): Promise<LocationFix | null> {
  if (!(await hasLocationPermission())) return null;
  const last = await getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
  if (last !== null) return toFix(last);
  return toFix(await getCurrentPositionAsync({ accuracy: Accuracy.High }));
}

/**
 * The location for a scan or an incident, within 5 s; null without permission, without a fix in time, or on any
 * error (location services off, no signal). Never throws: a missing location never stops a scan.
 */
export async function currentLocation(): Promise<LocationFix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([locate().catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follows the phone's position for showing it on a map, until the returned function is called; nothing of it is stored.
 * Never asks for the permission, and without it, or on any error, simply reports nothing.
 */
export function watchPosition(onPosition: (position: Coordinate) => void): () => void {
  let stopped = false;
  let stopWatching: (() => void) | undefined;
  void (async () => {
    if (!(await hasLocationPermission())) return;
    const subscription = await watchPositionAsync({ accuracy: Accuracy.High, distanceInterval: WATCH_DISTANCE_M }, ({ coords }) => {
      onPosition({ latitude: coords.latitude, longitude: coords.longitude });
    });
    if (stopped) subscription.remove();
    else stopWatching = () => subscription.remove();
  })().catch((error: unknown) => __DEV__ && console.warn('Following the position failed', error));
  return () => {
    stopped = true;
    stopWatching?.();
  };
}
