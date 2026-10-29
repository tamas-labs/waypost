import { NativeModule, requireNativeModule } from 'expo';

declare class WaypostClockModule extends NativeModule {
  getUptimeMs(): number;
  getBootId(): string;
  getGnssTimeMs(maxAgeMs: number): number | null;
}

export default requireNativeModule<WaypostClockModule>('WaypostClock');
