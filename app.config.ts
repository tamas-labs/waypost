// app.json, plus what depends on the environment. GOOGLE_MAPS_ANDROID_API_KEY: the key of Google Maps on Android (in
// .env.local or, on EAS, an environment variable). A build without it does not offer the map (src/location/maps.ts).
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    name: config.name ?? 'Waypost',
    slug: config.slug ?? 'waypost',
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey }]],
    extra: { ...config.extra, googleMapsConfigured: Boolean(androidGoogleMapsApiKey) },
  };
}
