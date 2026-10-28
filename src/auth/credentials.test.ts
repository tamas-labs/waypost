import * as SecureStore from 'expo-secure-store';

import {
  deleteDeviceCredentials,
  deleteSupervisorToken,
  getDeviceCredentials,
  getSupervisorToken,
  setDeviceCredentials,
  setSupervisorToken,
} from './credentials';

// __mocks__/expo-secure-store.ts
const store = (SecureStore as unknown as { store: Map<string, string> }).store;
const SECRET = 'q83vEjRWeJq83vEjRWeJq83vEjRWeJq83vEjRWeJq80=';

beforeEach(() => store.clear());

describe('credentials', () => {
  it('stores, reads and deletes the supervisor token', async () => {
    expect(await getSupervisorToken()).toBeNull();
    await setSupervisorToken('1|supervisor');
    expect(await getSupervisorToken()).toBe('1|supervisor');
    await deleteSupervisorToken();
    expect(await getSupervisorToken()).toBeNull();
    await expect(setSupervisorToken('')).rejects.toThrow('Empty supervisor token');
  });

  it('stores, reads and deletes the device token and secret together', async () => {
    expect(await getDeviceCredentials()).toBeNull();
    await setDeviceCredentials({ token: '2|device', secret: SECRET });
    expect(await getDeviceCredentials()).toEqual({ token: '2|device', secret: SECRET });
    await deleteDeviceCredentials();
    expect(await getDeviceCredentials()).toBeNull();
    expect(store.size).toBe(0);
  });

  it('is readable while the phone is locked (after the first unlock)', async () => {
    await setDeviceCredentials({ token: '2|device', secret: SECRET });
    for (const call of (SecureStore.setItemAsync as jest.Mock).mock.calls) {
      expect(call[2]).toEqual({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    }
  });

  it('rejects a secret that is not 32 bytes of base64', async () => {
    for (const secret of ['', 'not base64', SECRET.slice(0, 43), `${SECRET.slice(0, 42)}A==`, 'q83vEjRWeJq83vEjRWeJq83vEjRWeJq83vEjRWeJq81=']) {
      await expect(setDeviceCredentials({ token: '2|device', secret })).rejects.toThrow('32 bytes in base64');
    }
    await expect(setDeviceCredentials({ token: '', secret: SECRET })).rejects.toThrow('Empty device token');
    expect(store.size).toBe(0);
  });

  it('treats a token without its secret as no credentials', async () => {
    store.set('waypost.device_token', '2|device');
    expect(await getDeviceCredentials()).toBeNull();
  });
});
