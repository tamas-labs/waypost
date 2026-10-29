// Global test setup.

// expo-crypto's native random source is not available in Jest; Node's is.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual<object>('expo-crypto'),
  getRandomValues: <T extends ArrayBufferView>(array: T): T => {
    require('node:crypto').randomFillSync(array);
    return array;
  },
}));

// NetInfo is a native module; its package ships a Jest mock (always connected).
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

// react-native-quick-crypto is native (JSI); its package ships a Jest mock that forwards to node:crypto.
jest.mock('react-native-quick-crypto', () => require('react-native-quick-crypto/jest/index.js'));

// expo-audio's player is native; a player that plays nothing.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({ seekTo: jest.fn(() => Promise.resolve()), play: jest.fn(), remove: jest.fn() })),
}));
