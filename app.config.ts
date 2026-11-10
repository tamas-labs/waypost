// app.json, plus what depends on the environment. GOOGLE_MAPS_ANDROID_API_KEY: the key of Google Maps on Android (in
// .env.local or, on EAS, an environment variable). A build without it does not offer the map (src/location/maps.ts).
// EXPO_PUBLIC_WAYPOST_API_URL: if it is plain http:// (a backend on the local network), the Android release build allows
// cleartext traffic too, otherwise it could not reach the server (the debug build always allows it).
// R8 keep rules: the release build is minified (android.enableMinifyInReleaseBuilds) in R8 full mode, which keeps only the
// members a rule names. WorkManager 2.9 (from react-native-maps) keeps its Room database class but not the no-argument
// constructor of WorkDatabase_Impl, so the app crashed at launch ("Failed to create an instance of class
// androidx.work.impl.WorkDatabase").
import fs from 'node:fs';
import path from 'node:path';

import { withAndroidManifest, withDangerousMod, type ConfigPlugin } from 'expo/config-plugins';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const PROGUARD_RULES = `
# Waypost (app.config.ts): Room creates the generated database classes through their no-argument constructor.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
`;

const withProguardRules: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    (mod) => {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rules = fs.readFileSync(file, 'utf8');
      if (!rules.includes(PROGUARD_RULES)) fs.writeFileSync(file, rules + PROGUARD_RULES);
      return mod;
    },
  ]);

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
  const expoConfig: ExpoConfig = {
    ...config,
    name: config.name ?? 'Waypost',
    slug: config.slug ?? 'waypost',
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey }]],
    extra: { ...config.extra, googleMapsConfigured: Boolean(androidGoogleMapsApiKey) },
  };
  return withProguardRules(withCleartextTraffic(expoConfig, cleartextApi));
}
