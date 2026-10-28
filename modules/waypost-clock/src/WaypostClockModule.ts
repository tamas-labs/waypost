import { NativeModule, requireNativeModule } from 'expo';

declare class WaypostClockModule extends NativeModule {
  getUptimeMs(): number;
  getBootId(): string;
}

export default requireNativeModule<WaypostClockModule>('WaypostClock');
