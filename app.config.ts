// app.json, plus what depends on the environment. GOOGLE_MAPS_ANDROID_API_KEY: the key of Google Maps on Android (in
// .env.local or, on EAS, an environment variable). A build without it does not offer the map (src/location/maps.ts).
// EXPO_PUBLIC_WAYPOST_API_URL: if it is plain http:// (a backend on the local network), the Android release build allows
// cleartext traffic too, otherwise it could not reach the server (the debug build always allows it).
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const withCleartextTraffic: ConfigPlugin<boolean> = (config, allowed) =>
  withAndroidManifest(config, (manifest) => {
    const application = manifest.modResults.manifest.application?.[0];
    if (application) {
      if (allowed) application.$['android:usesCleartextTraffic'] = 'true';
      else delete application.$['android:usesCleartextTraffic'];
    }
    return manifest;
  });

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const cleartextApi = (process.env.EXPO_PUBLIC_WAYPOST_API_URL ?? '').startsWith('http://');
  return withCleartextTraffic(
    {
      ...config,
      name: config.name ?? 'Waypost',
      slug: config.slug ?? 'waypost',
      plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey }]],
      extra: { ...config.extra, googleMapsConfigured: Boolean(androidGoogleMapsApiKey) },
    },
    cleartextApi,
  );
}
