// One import per weight: the package index would bundle the unused 200 and 300 weights too.
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { startAlarmScreen } from '@/alarms/active-alarms';
import { startRoundAlarms } from '@/alarms/round-alarms';
import { loadSession } from '@/auth/session';
import { StartupError } from '@/components/startup-error';
import { getDatabase, openDatabase } from '@/db/open';
import { startFeedback } from '@/feedback/feedback';
import { startScheduler } from '@/guard/scheduler';
import { startTagEvents } from '@/nfc/tag-events';
import { AppStack } from '@/navigation/app-stack';
import { startSync } from '@/sync/runtime';
import { loadThemePreference, saveThemePreference } from '@/theme/preference';
import { ThemeProvider, useTheme, type ThemePreference } from '@/theme/theme-provider';

// The splash screen stays until the fonts are loaded and the session is known (DESIGN_HANDOFF 3).
void SplashScreen.preventAutoHideAsync();

type Startup = { state: 'loading' } | { state: 'ready'; themePreference: ThemePreference } | { state: 'failed'; error: unknown };

/**
 * Opens and migrates the database, then reads the device mode (specification, Mobilapp: three start states) and the
 * stored theme choice, so the first screen already has the chosen theme.
 */
function useStartup(): [Startup, () => void] {
  const [startup, setStartup] = useState<Startup>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    openDatabase()
      .then(async (db) => {
        await loadSession(db);
        return loadThemePreference(db);
      })
      .then(
        (themePreference) => current && setStartup({ state: 'ready', themePreference }),
        (error: unknown) => current && setStartup({ state: 'failed', error }),
      );
    return () => {
      current = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setStartup({ state: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return [startup, retry];
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  const [startup, retry] = useStartup();
  const ready = (fontsLoaded || fontError !== null) && startup.state !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // The sync, the scheduler, the round alarms and the tag listening run while the app does, from the start
  // (specification, Szinkron protokoll / Mikor fut; Állapotgépek / Kör; Mobilapp / Ébresztés, NFC és QR).
  useEffect(() => {
    if (startup.state !== 'ready') return undefined;
    const db = getDatabase();
    const stops = [startSync(db), startScheduler(db), startRoundAlarms(db), startAlarmScreen(db), startTagEvents(), startFeedback()];
    return () => stops.forEach((stop) => stop());
  }, [startup.state]);

  if (!ready) return null;
  return (
    // Without a database (failed start) the theme follows the system and a choice is not stored.
    <ThemeProvider
      initialPreference={startup.state === 'ready' ? startup.themePreference : 'system'}
      onPreferenceChange={startup.state === 'ready' ? storeThemePreference : undefined}
    >
      <ThemedStatusBar />
      {startup.state === 'failed' ? <StartupError error={startup.error} onRetry={retry} /> : <AppStack />}
    </ThemeProvider>
  );
}

function storeThemePreference(preference: ThemePreference) {
  saveThemePreference(getDatabase(), preference);
}

function ThemedStatusBar() {
  const { name } = useTheme();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}
