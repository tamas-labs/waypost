// The phone's readiness for a shift (B-Muszakkezdes, "Készenlét"): NFC on, the alarms able to ring, the location
// allowed, and on Android the exemption from battery optimization. A missing one does not stop the shift; the row
// warns and offers the fix (the system dialog or settings screen).
import { Linking, Platform } from 'react-native';

import { getAlarmPermissions, requestBatteryExemption, requestExactAlarms, requestNotifications, type AlarmPermissions } from '@/alarms/permissions';
import { getLocationPermission, requestLocationPermission } from '@/location/location';
import { getNfcStatus, openNfcSettings, type NfcStatus } from '@/nfc/reader';

export interface Readiness {
  nfc: NfcStatus;
  alarms: AlarmPermissions;
  location: { granted: boolean; canAskAgain: boolean };
}

export type ReadinessItem = 'nfc' | 'alarms' | 'location' | 'battery';

export interface ReadinessRow {
  item: ReadinessItem;
  ok: boolean;
  /** The app can open the dialog or the setting that fixes it. */
  fixable: boolean;
}

export async function getReadiness(): Promise<Readiness> {
  const [nfc, alarms, location] = await Promise.all([getNfcStatus(), getAlarmPermissions(), getLocationPermission()]);
  return { nfc, alarms, location };
}

/** The rows of the checklist; battery optimization exists on Android only. */
export function readinessRows({ nfc, alarms, location }: Readiness): ReadinessRow[] {
  const rows: ReadinessRow[] = [
    // Without NFC hardware only QR is left; there is nothing to switch on.
    { item: 'nfc', ok: nfc.supported && nfc.enabled, fixable: nfc.supported && Platform.OS === 'android' },
    { item: 'alarms', ok: alarms.notifications.granted && alarms.exactAlarms !== false, fixable: true },
    { item: 'location', ok: location.granted, fixable: true },
  ];
  if (alarms.batteryExempt !== null) rows.push({ item: 'battery', ok: alarms.batteryExempt, fixable: true });
  return rows;
}

/** Opens what fixes the item; resolves when the dialog closes or the settings screen has been opened. */
export async function fixReadiness(item: ReadinessItem, { alarms, location }: Readiness): Promise<void> {
  switch (item) {
    case 'nfc':
      return openNfcSettings();
    case 'alarms':
      if (!alarms.notifications.granted) return requestNotifications(alarms.notifications.canAskAgain);
      return requestExactAlarms();
    case 'location':
      if (location.canAskAgain) {
        await requestLocationPermission();
        return;
      }
      return Linking.openSettings();
    case 'battery':
      return requestBatteryExemption();
  }
}
