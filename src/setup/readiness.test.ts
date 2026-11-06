import { Linking, Platform } from 'react-native';

import { requestBatteryExemption, requestExactAlarms, requestNotifications } from '@/alarms/permissions';
import { requestLocationPermission } from '@/location/location';
import { openNfcSettings } from '@/nfc/reader';
import { requestCameraPermission } from '@/photo/camera';

import { fixReadiness, needsSetup, readinessRows, setupRows, type Readiness } from './readiness';

jest.mock('@/alarms/permissions', () => ({
  getAlarmPermissions: jest.fn(),
  requestNotifications: jest.fn(),
  requestExactAlarms: jest.fn(),
  requestBatteryExemption: jest.fn(),
}));
jest.mock('@/location/location', () => ({ getLocationPermission: jest.fn(), requestLocationPermission: jest.fn() }));
jest.mock('@/nfc/reader', () => ({ getNfcStatus: jest.fn(), openNfcSettings: jest.fn() }));
jest.mock('@/photo/camera', () => ({ getCameraPermission: jest.fn(), requestCameraPermission: jest.fn() }));

const READY: Readiness = {
  nfc: { supported: true, enabled: true },
  alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true },
  location: { granted: true, canAskAgain: true },
  camera: { granted: true, canAskAgain: true },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('the readiness rows', () => {
  it('are all ok on a ready Android phone', () => {
    expect(readinessRows(READY)).toEqual([
      { item: 'nfc', ok: true, fixable: true },
      { item: 'alarms', ok: true, fixable: true },
      { item: 'location', ok: true, fixable: true },
      { item: 'battery', ok: true, fixable: true },
    ]);
  });

  it('warn about what is missing', () => {
    const rows = readinessRows({
      nfc: { supported: true, enabled: false },
      alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: false, batteryExempt: false },
      location: { granted: false, canAskAgain: true },
      camera: { granted: false, canAskAgain: true },
    });
    expect(rows.map(({ item, ok }) => [item, ok])).toEqual([
      ['nfc', false],
      ['alarms', false],
      ['location', false],
      ['battery', false],
    ]);
  });

  it('have no battery row on iOS, and nothing to switch on without NFC hardware', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const rows = readinessRows({
      ...READY,
      nfc: { supported: false, enabled: false },
      alarms: { ...READY.alarms, exactAlarms: null, batteryExempt: null },
    });
    expect(rows).toEqual([
      { item: 'nfc', ok: false, fixable: false },
      { item: 'alarms', ok: true, fixable: true },
      { item: 'location', ok: true, fixable: true },
    ]);
  });
});

describe('the device setup rows', () => {
  it('list every setting of the site phone on Android, in the specification order', () => {
    expect(setupRows(READY, 'site_phone')).toEqual([
      { item: 'notifications', ok: true, fixable: true },
      { item: 'exactAlarms', ok: true, fixable: true },
      { item: 'battery', ok: true, fixable: true },
      { item: 'location', ok: true, fixable: true },
      { item: 'camera', ok: true, fixable: true },
      { item: 'nfc', ok: true, fixable: true },
    ]);
  });

  it('have no exact alarm and battery row on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const rows = setupRows({ ...READY, alarms: { ...READY.alarms, exactAlarms: null, batteryExempt: null } }, 'site_phone');
    expect(rows.map((row) => row.item)).toEqual(['notifications', 'location', 'camera', 'nfc']);
    // iOS has no NFC switch to open.
    expect(rows.find((row) => row.item === 'nfc')).toEqual({ item: 'nfc', ok: true, fixable: false });
  });

  it("leave out the alarms on a supervisor's own phone", () => {
    const rows = setupRows(
      { ...READY, alarms: { notifications: { granted: false, canAskAgain: true }, exactAlarms: false, batteryExempt: false } },
      'supervisor_phone',
    );
    expect(rows.map((row) => row.item)).toEqual(['location', 'camera', 'nfc']);
    expect(needsSetup(rows)).toBe(false);
  });

  it('need setup when something fixable is missing, not for a phone without NFC', () => {
    expect(needsSetup(setupRows(READY, 'site_phone'))).toBe(false);
    expect(needsSetup(setupRows({ ...READY, camera: { granted: false, canAskAgain: false } }, 'site_phone'))).toBe(true);
    expect(needsSetup(setupRows({ ...READY, alarms: { ...READY.alarms, exactAlarms: false } }, 'site_phone'))).toBe(true);
    expect(needsSetup(setupRows({ ...READY, nfc: { supported: false, enabled: false } }, 'site_phone'))).toBe(false);
  });
});

describe('fixing', () => {
  it('opens the matching dialog or setting', async () => {
    await fixReadiness('nfc', READY);
    expect(openNfcSettings).toHaveBeenCalled();
    await fixReadiness('battery', READY);
    expect(requestBatteryExemption).toHaveBeenCalled();
  });

  it('asks for notifications first, then for exact alarms', async () => {
    await fixReadiness('alarms', {
      ...READY,
      alarms: { ...READY.alarms, notifications: { granted: false, canAskAgain: false }, exactAlarms: false },
    });
    expect(requestNotifications).toHaveBeenCalledWith(false);
    expect(requestExactAlarms).not.toHaveBeenCalled();
    await fixReadiness('alarms', { ...READY, alarms: { ...READY.alarms, exactAlarms: false } });
    expect(requestExactAlarms).toHaveBeenCalled();
  });

  it('asks for the location while the system lets it, then opens the settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await fixReadiness('location', { ...READY, location: { granted: false, canAskAgain: true } });
    expect(requestLocationPermission).toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    await fixReadiness('location', { ...READY, location: { granted: false, canAskAgain: false } });
    expect(openSettings).toHaveBeenCalled();
  });

  it('asks for notifications and exact alarms one by one', async () => {
    await fixReadiness('notifications', { ...READY, alarms: { ...READY.alarms, notifications: { granted: false, canAskAgain: true } } });
    expect(requestNotifications).toHaveBeenCalledWith(true);
    expect(requestExactAlarms).not.toHaveBeenCalled();
    await fixReadiness('exactAlarms', READY);
    expect(requestExactAlarms).toHaveBeenCalled();
  });

  it('asks for the camera while the system lets it, then opens the settings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await fixReadiness('camera', { ...READY, camera: { granted: false, canAskAgain: true } });
    expect(requestCameraPermission).toHaveBeenCalled();
    expect(openSettings).not.toHaveBeenCalled();
    await fixReadiness('camera', { ...READY, camera: { granted: false, canAskAgain: false } });
    expect(openSettings).toHaveBeenCalled();
  });
});
