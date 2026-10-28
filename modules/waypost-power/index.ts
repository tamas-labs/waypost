// waypost-power: the battery optimization exemption on Android (spec: Mobilapp / Ébresztés). iOS has no such setting.
import WaypostPower from './src/WaypostPowerModule';

/** true or false on Android; null on iOS, where the setting does not exist. */
export function isIgnoringBatteryOptimizations(): boolean | null {
  return WaypostPower?.isIgnoringBatteryOptimizations() ?? null;
}

/** Android: asks for the exemption in a system dialog (or opens the settings list). Does nothing on iOS. */
export function requestIgnoreBatteryOptimizations(): void {
  WaypostPower?.requestIgnoreBatteryOptimizations();
}
