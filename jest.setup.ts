// Global test setup.

// expo-crypto's native random source is not available in Jest; Node's is.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual<object>('expo-crypto'),
  getRandomValues: <T extends ArrayBufferView>(array: T): T => {
    require('node:crypto').randomFillSync(array);
    return array;
  },
}));
