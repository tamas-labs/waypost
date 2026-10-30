import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Whether this build can show a map. Android's Google Maps stops the app when it opens without an API key
 * (`GOOGLE_MAPS_ANDROID_API_KEY`, app.config.ts); iOS uses Apple Maps, which needs none.
 */
export function mapsConfigured(): boolean {
  return Platform.OS !== 'android' || Constants.expoConfig?.extra?.googleMapsConfigured === true;
}
