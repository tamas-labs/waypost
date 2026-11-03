import { Link, Stack, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useSession } from '@/auth/session';
import { SegmentedControl } from '@/components/segmented-control';
import { t, type TranslationKey } from '@/i18n';
import { useTheme, useThemePreference } from '@/theme/theme-provider';
import type { ThemePreference } from '@/theme/tokens';

const SCREENS: { href: Href; title: TranslationKey }[] = [
  { href: '/dev/server', title: 'dev.screens.server' },
  { href: '/dev/components', title: 'dev.screens.components' },
  { href: '/prototype/clock', title: 'prototype.screens.clock' },
  { href: '/prototype/nfc', title: 'prototype.screens.nfc' },
  { href: '/prototype/qr', title: 'prototype.screens.qr' },
  { href: '/prototype/alarms', title: 'prototype.screens.alarms' },
  { href: '/prototype/field', title: 'prototype.screens.field' },
  { href: '/prototype/benchmark', title: 'prototype.screens.benchmark' },
];

const THEME_PREFERENCES: ThemePreference[] = ['system', 'dark', 'light'];

// Developer tools: the API address (instead of the developer enrollment of M3-06), the base components (M3-26), the
// device test screens of the M1 prototype (and of the location and the photo, M3-20 / M3-21), and the theme choice until
// the app has a settings screen (M3-25).
export default function DevToolsScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const mode = useSession((session) => session.mode);
  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={{ padding: space.l, gap: space.m }}>
      <Stack.Screen options={{ title: t('dev.title') }} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('dev.subtitle')}</Text>
      {mode !== null && <Text style={[typography.body, { color: color.text }]}>{t('dev.mode', { mode: t(`dev.modes.${mode}`) })}</Text>}
      {SCREENS.map((screen) => (
        <Link key={screen.title} href={screen.href} asChild>
          <Pressable
            // Link asChild needs a flat style object.
            style={StyleSheet.flatten([
              styles.item,
              {
                backgroundColor: color.surface,
                borderColor: color.cardBorder,
                borderRadius: radius.item,
                minHeight: size.listItem,
                paddingHorizontal: space.l,
              },
            ])}
          >
            <Text style={[typography.body, { color: color.text }]}>{t(screen.title)}</Text>
          </Pressable>
        </Link>
      ))}
      <Text style={[typography.label, { color: color.text2, marginTop: space.l }]}>{t('theme.title')}</Text>
      <SegmentedControl
        accessibilityLabel={t('theme.title')}
        options={THEME_PREFERENCES.map((value) => ({ value, label: t(`theme.${value}`) }))}
        value={preference}
        onChange={setPreference}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, justifyContent: 'center' },
});
