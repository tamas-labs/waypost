import { resolveStartup } from './startup';

const DEVICE_ID = '01900000-0000-7000-8000-0000000000d1';

describe('resolveStartup', () => {
  it('is the site phone with device credentials and a database that knows the device', () => {
    expect(resolveStartup({ hasDeviceCredentials: true, deviceId: DEVICE_ID, hasSupervisorToken: false })).toEqual({
      mode: 'site_phone',
      deviceId: DEVICE_ID,
      deleteDeviceCredentials: false,
      deleteSupervisorToken: false,
    });
  });

  it('removes a supervisor token left on the site phone', () => {
    expect(resolveStartup({ hasDeviceCredentials: true, deviceId: DEVICE_ID, hasSupervisorToken: true })).toMatchObject({
      mode: 'site_phone',
      deleteSupervisorToken: true,
    });
  });

  it("is a supervisor's own phone with a supervisor token only", () => {
    expect(resolveStartup({ hasDeviceCredentials: false, deviceId: null, hasSupervisorToken: true })).toEqual({
      mode: 'supervisor_phone',
      deviceId: null,
      deleteDeviceCredentials: false,
      deleteSupervisorToken: false,
    });
  });

  it('is not enrolled without any credentials', () => {
    expect(resolveStartup({ hasDeviceCredentials: false, deviceId: null, hasSupervisorToken: false }).mode).toBe('unassigned');
    // The database remembers an enrollment, but the secure store lost the credentials: it must be enrolled again.
    expect(resolveStartup({ hasDeviceCredentials: false, deviceId: DEVICE_ID, hasSupervisorToken: false })).toMatchObject({
      mode: 'unassigned',
      deviceId: null,
      deleteDeviceCredentials: false,
    });
  });

  it('drops device credentials an earlier installation left in the Keychain', () => {
    expect(resolveStartup({ hasDeviceCredentials: true, deviceId: null, hasSupervisorToken: false })).toEqual({
      mode: 'unassigned',
      deviceId: null,
      deleteDeviceCredentials: true,
      deleteSupervisorToken: false,
    });
    expect(resolveStartup({ hasDeviceCredentials: true, deviceId: null, hasSupervisorToken: true }).mode).toBe('supervisor_phone');
  });
});
