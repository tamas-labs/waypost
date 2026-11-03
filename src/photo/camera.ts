// The camera permission outside a camera view (the device setup checklist); the camera views ask with
// useCameraPermissions themselves.
import { Camera } from 'expo-camera';

/** The camera permission, and whether the system still shows its request (if not, only the app's settings can grant it). */
export async function getCameraPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  const { granted, canAskAgain } = await Camera.getCameraPermissionsAsync();
  return { granted, canAskAgain };
}

export async function requestCameraPermission(): Promise<boolean> {
  return (await Camera.requestCameraPermissionsAsync()).granted;
}
