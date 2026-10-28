// What the round alarms need from the phone, and how to ask for it (spec: Mobilapp / Ébresztés).
import { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } from '@modules/waypost-power';
import {
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications';
import { Linking, Platform } from 'react-native';

export interface AlarmPermissions {
  notifications: {
    granted: boolean;
    /** false: the system no longer shows the request, only the app's settings can grant it. */
    canAskAgain: boolean;
  };
  /** Android 12+: exact alarms (SCHEDULE_EXACT_ALARM); null on iOS, where it does not exist. */
  exactAlarms: boolean | null;
  /** Android: exempt from battery optimization; null on iOS. */
  batteryExempt: boolean | null;
}

export async function getAlarmPermissions(): Promise<AlarmPermissions> {
  const notifications = await getPermissionsAsync();
  const android = Platform.OS === 'android';
  return {
    notifications: { granted: notifications.granted, canAskAgain: notifications.canAskAgain },
    exactAlarms: android ? (await getExactAlarmPermissionsAsync()).granted : null,
    batteryExempt: android ? isIgnoringBatteryOptimizations() : null,
  };
}

/** Whether every alarm setting the platform has is in place. */
export function allAlarmPermissionsGranted(permissions: AlarmPermissions): boolean {
  return permissions.notifications.granted && permissions.exactAlarms !== false && permissions.batteryExempt !== false;
}

/**
 * Asks for showing notifications: the system dialog while it may be shown, otherwise the app's settings.
 * iOS: alert, sound and badge; time-sensitive delivery comes with the entitlement (app.json), it is not asked for.
 */
export async function requestNotifications(canAskAgain: boolean): Promise<void> {
  if (canAskAgain) await requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
  else await Linking.openSettings();
}

/**
 * Android: opens the system screen for exact alarms; resolves when the guard comes back. If the permission is
 * taken away there, Android restarts the app and this never resolves; the screen checks again on start.
 */
export async function requestExactAlarms(): Promise<void> {
  await requestExactAlarmPermissionsAsync();
}

/** Android: the system dialog for the battery optimization exemption. */
export function requestBatteryExemption(): void {
  requestIgnoreBatteryOptimizations();
}
