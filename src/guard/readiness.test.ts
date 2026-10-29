import { Linking, Platform } from 'react-native';

import { requestBatteryExemption, requestExactAlarms, requestNotifications } from '@/alarms/permissions';
import { requestLocationPermission } from '@/location/location';
import { openNfcSettings } from '@/nfc/reader';

import { fixReadiness, readinessRows, type Readiness } from './readiness';

jest.mock('@/alarms/permissions', () => ({ getAlarmPermissions: jest.fn(), requestNotifications: jest.fn(), requestExactAlarms: jest.fn(), requestBatteryExemption: jest.fn() }));
jest.mock('@/location/location', () => ({ getLocationPermission: jest.fn(), requestLocationPermission: jest.fn() }));
jest.mock('@/nfc/reader', () => ({ getNfcStatus: jest.fn(), openNfcSettings: jest.fn() }));

const READY: Readiness = {
  nfc: { supported: true, enabled: true },
  alarms: { notifications: { granted: true, canAskAgain: true }, exactAlarms: true, batteryExempt: true },
  location: { granted: true, canAskAgain: true },
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
    const rows = readinessRows({ ...READY, nfc: { supported: false, enabled: false }, alarms: { ...READY.alarms, exactAlarms: null, batteryExempt: null } });
    expect(rows).toEqual([
      { item: 'nfc', ok: false, fixable: false },
      { item: 'alarms', ok: true, fixable: true },
      { item: 'location', ok: true, fixable: true },
    ]);
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
    await fixReadiness('alarms', { ...READY, alarms: { ...READY.alarms, notifications: { granted: false, canAskAgain: false }, exactAlarms: false } });
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
});
