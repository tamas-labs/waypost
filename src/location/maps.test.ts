import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { mapsConfigured } from './maps';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const configure = (googleMapsConfigured: boolean) => {
  Constants.expoConfig!.extra = { googleMapsConfigured };
};

afterEach(() => jest.restoreAllMocks());

it('needs the key on Android', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  configure(false);
  expect(mapsConfigured()).toBe(false);
  configure(true);
  expect(mapsConfigured()).toBe(true);
});

it('needs no key on iOS', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  configure(false);
  expect(mapsConfigured()).toBe(true);
});
