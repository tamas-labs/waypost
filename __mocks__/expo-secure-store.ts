// In-memory secure store for Jest (used automatically: a mock of a node module next to node_modules).
export const AFTER_FIRST_UNLOCK = 0;
export const WHEN_UNLOCKED = 5;

/** The stored values; tests may read and clear it. */
export const store = new Map<string, string>();

export const getItemAsync = jest.fn(async (key: string) => store.get(key) ?? null);
export const setItemAsync = jest.fn(async (key: string, value: string) => void store.set(key, value));
export const deleteItemAsync = jest.fn(async (key: string) => void store.delete(key));
