import { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } from './index';

const mockNative = { isIgnoringBatteryOptimizations: jest.fn(), requestIgnoreBatteryOptimizations: jest.fn() };
let mockAvailable = true;
jest.mock('./src/WaypostPowerModule', () => ({
  __esModule: true,
  get default() {
    return mockAvailable ? mockNative : null;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
});

test('Android: passes the state through and asks for the exemption', () => {
  mockNative.isIgnoringBatteryOptimizations.mockReturnValue(false);
  expect(isIgnoringBatteryOptimizations()).toBe(false);
  requestIgnoreBatteryOptimizations();
  expect(mockNative.requestIgnoreBatteryOptimizations).toHaveBeenCalledTimes(1);
});

test('iOS (no native module): null, and asking does nothing', () => {
  mockAvailable = false;
  expect(isIgnoringBatteryOptimizations()).toBeNull();
  expect(() => requestIgnoreBatteryOptimizations()).not.toThrow();
});
