// The phone's readiness for a shift (B-Muszakkezdes, "Készenlét"): NFC on, the alarms able to ring, the location
// allowed, and on Android the exemption from battery optimization. A missing one does not stop the shift; the row
// warns and offers the fix (the system dialog or settings screen). The device setup checklist (device-setup) shows
// the same, item by item, with the camera too.
import { Linking, Platform } from 'react-native';

import {
  getAlarmPermissions,
  requestBatteryExemption,
  requestExactAlarms,
  requestNotifications,
  type AlarmPermissions,
} from '@/alarms/permissions';
import { getLocationPermission, requestLocationPermission } from '@/location/location';
import { getNfcStatus, openNfcSettings, type NfcStatus } from '@/nfc/reader';
import { getCameraPermission, requestCameraPermission } from '@/photo/camera';

interface Permission {
  granted: boolean;
  /** false: the system no longer shows the request, only the app's settings can grant it. */
  canAskAgain: boolean;
}

export interface Readiness {
  nfc: NfcStatus;
  alarms: AlarmPermissions;
  location: Permission;
  camera: Permission;
}

/** The rows of the shift start: the alarms are one row there. */
export type ReadinessItem = 'nfc' | 'alarms' | 'location' | 'battery';
/** The rows of the device setup checklist, in the specification's order. */
export type SetupItem = 'notifications' | 'exactAlarms' | 'battery' | 'location' | 'camera' | 'nfc';

export interface ChecklistRow<Item extends ReadinessItem | SetupItem = ReadinessItem> {
  item: Item;
  ok: boolean;
  /** The app can open the dialog or the setting that fixes it. */
  fixable: boolean;
}

export type ReadinessRow = ChecklistRow<ReadinessItem>;
export type SetupRow = ChecklistRow<SetupItem>;

export async function getReadiness(): Promise<Readiness> {
  const [nfc, alarms, location, camera] = await Promise.all([
    getNfcStatus(),
    getAlarmPermissions(),
    getLocationPermission(),
    getCameraPermission(),
  ]);
  return { nfc, alarms, location, camera };
}

/** Without NFC hardware only QR is left; there is nothing to switch on (and iOS has no NFC switch). */
function nfcRow({ nfc }: Readiness): ChecklistRow<'nfc'> {
  return { item: 'nfc', ok: nfc.supported && nfc.enabled, fixable: nfc.supported && Platform.OS === 'android' };
}

/** The rows of the checklist; battery optimization exists on Android only. */
export function readinessRows(readiness: Readiness): ReadinessRow[] {
  const { alarms, location } = readiness;
  const rows: ReadinessRow[] = [
    nfcRow(readiness),
    { item: 'alarms', ok: alarms.notifications.granted && alarms.exactAlarms !== false, fixable: true },
    { item: 'location', ok: location.granted, fixable: true },
  ];
  if (alarms.batteryExempt !== null) rows.push({ item: 'battery', ok: alarms.batteryExempt, fixable: true });
  return rows;
}

/**
 * The device setup checklist. The site phone needs all: the alarms ring there (notifications, on Android exact alarms
 * and the battery exemption), and the rounds scan with location, camera and NFC. A supervisor's own phone has no
 * alarms; it only trains routes and takes photos.
 */
export function setupRows(readiness: Readiness, mode: 'site_phone' | 'supervisor_phone'): SetupRow[] {
  const { alarms, location, camera } = readiness;
  const rows: SetupRow[] = [];
  if (mode === 'site_phone') {
    rows.push({ item: 'notifications', ok: alarms.notifications.granted, fixable: true });
    if (alarms.exactAlarms !== null) rows.push({ item: 'exactAlarms', ok: alarms.exactAlarms, fixable: true });
    if (alarms.batteryExempt !== null) rows.push({ item: 'battery', ok: alarms.batteryExempt, fixable: true });
  }
  rows.push({ item: 'location', ok: location.granted, fixable: true }, { item: 'camera', ok: camera.granted, fixable: true });
  rows.push(nfcRow(readiness));
  return rows;
}

/** Whether a row of the list is missing and can be fixed (a phone without NFC is not). */
export function needsSetup(rows: readonly ChecklistRow<ReadinessItem | SetupItem>[]): boolean {
  return rows.some((row) => !row.ok && row.fixable);
}

/** The system dialog while it may be shown, otherwise the app's settings. */
async function askOrOpenSettings(permission: Permission, ask: () => Promise<unknown>): Promise<void> {
  if (permission.canAskAgain) {
    await ask();
    return;
  }
  await Linking.openSettings();
}

/** Opens what fixes the item; resolves when the dialog closes or the settings screen has been opened. */
export async function fixReadiness(item: ReadinessItem | SetupItem, { alarms, location, camera }: Readiness): Promise<void> {
  switch (item) {
    case 'nfc':
      return openNfcSettings();
    case 'alarms':
      if (!alarms.notifications.granted) return requestNotifications(alarms.notifications.canAskAgain);
      return requestExactAlarms();
    case 'notifications':
      return requestNotifications(alarms.notifications.canAskAgain);
    case 'exactAlarms':
      return requestExactAlarms();
    case 'location':
      return askOrOpenSettings(location, requestLocationPermission);
    case 'camera':
      return askOrOpenSettings(camera, requestCameraPermission);
    case 'battery':
      return requestBatteryExemption();
  }
}
