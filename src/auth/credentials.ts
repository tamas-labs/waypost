// Tokens and the device secret in the secure store (iOS Keychain, Android Keystore); never in the database.
import * as SecureStore from 'expo-secure-store';

const SUPERVISOR_TOKEN = 'waypost.supervisor_token';
const DEVICE_TOKEN = 'waypost.device_token';
const DEVICE_SECRET = 'waypost.device_secret';

// Readable after the first unlock since boot: alarms and sync must work while the phone is locked.
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** 32 bytes in base64, as POST /devices/enroll returns it. */
const SECRET = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

/** What the site phone authenticates and signs with. */
export interface DeviceCredentials {
  /** Bearer token with the device ability. */
  token: string;
  /** HMAC-SHA256 key of the chain, base64 (32 bytes). */
  secret: string;
}

export function getSupervisorToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SUPERVISOR_TOKEN, OPTIONS);
}

export async function setSupervisorToken(token: string): Promise<void> {
  if (token === '') throw new Error('Empty supervisor token');
  await SecureStore.setItemAsync(SUPERVISOR_TOKEN, token, OPTIONS);
}

export function deleteSupervisorToken(): Promise<void> {
  return SecureStore.deleteItemAsync(SUPERVISOR_TOKEN, OPTIONS);
}

/** The device token and secret; null unless both are stored. */
export async function getDeviceCredentials(): Promise<DeviceCredentials | null> {
  const [token, secret] = await Promise.all([SecureStore.getItemAsync(DEVICE_TOKEN, OPTIONS), SecureStore.getItemAsync(DEVICE_SECRET, OPTIONS)]);
  return token !== null && secret !== null ? { token, secret } : null;
}

export async function setDeviceCredentials({ token, secret }: DeviceCredentials): Promise<void> {
  if (token === '') throw new Error('Empty device token');
  if (!SECRET.test(secret)) throw new Error('The device secret must be 32 bytes in base64');
  // Secret first: a token without its secret would let the phone sync without being able to sign.
  await SecureStore.setItemAsync(DEVICE_SECRET, secret, OPTIONS);
  await SecureStore.setItemAsync(DEVICE_TOKEN, token, OPTIONS);
}

export async function deleteDeviceCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_TOKEN, OPTIONS);
  await SecureStore.deleteItemAsync(DEVICE_SECRET, OPTIONS);
}
