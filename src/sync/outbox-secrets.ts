// The fields of an outbox call that must not lie in the database (FR-012: a new supervisor's password, which opens all
// of their sites): in the secure store under the call's ID until the call is done or dropped. The database is not
// encrypted, and on iOS it goes into the backup; these items stay on this phone (…_THIS_DEVICE_ONLY), readable after
// the first unlock, as the sync runs with the phone locked too.
import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

const keyOf = (callId: string) => `waypost.outbox.${callId}`;

export async function storeOutboxSecrets(callId: string, fields: Record<string, string>): Promise<void> {
  await SecureStore.setItemAsync(keyOf(callId), JSON.stringify(fields), OPTIONS);
}

/** The fields of the call; null if there are none (lost: e.g. the phone restored from a backup to another one). */
export async function readOutboxSecrets(callId: string): Promise<Record<string, string> | null> {
  const text = await SecureStore.getItemAsync(keyOf(callId), OPTIONS);
  if (text === null) return null;
  const fields: unknown = JSON.parse(text);
  return typeof fields === 'object' && fields !== null ? (fields as Record<string, string>) : null;
}

/** After the call is done or dropped. A failure is only logged: the item is an orphan then, of a call that is gone. */
export function forgetOutboxSecrets(callIds: readonly string[]): Promise<void> {
  return Promise.all(callIds.map((id) => SecureStore.deleteItemAsync(keyOf(id), OPTIONS))).then(
    () => undefined,
    (error: unknown) => console.warn('Deleting the secret fields of an outbox call failed', error),
  );
}
