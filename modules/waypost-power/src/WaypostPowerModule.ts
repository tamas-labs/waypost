import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class WaypostPowerModule extends NativeModule {
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
}

/** Android only: null on iOS. */
export default requireOptionalNativeModule<WaypostPowerModule>('WaypostPower');
