import { Link, Stack, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/auth/session';
import { t, type TranslationKey } from '@/i18n';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme/theme-provider';

const SCREENS: { href: Href; title: TranslationKey }[] = [
  { href: '/dev/enroll', title: 'dev.screens.enroll' },
  { href: '/prototype/clock', title: 'prototype.screens.clock' },
  { href: '/prototype/nfc', title: 'prototype.screens.nfc' },
  { href: '/prototype/qr', title: 'prototype.screens.qr' },
  { href: '/prototype/alarms', title: 'prototype.screens.alarms' },
  { href: '/prototype/field', title: 'prototype.screens.field' },
];

const THEME_PREFERENCES: ThemePreference[] = ['system', 'dark', 'light'];

// Developer tools: the developer enrollment (M3-06), the device test screens of the M1 prototype (and of
// the location and the photo, M3-20 / M3-21), and the theme choice until the app has a settings screen (M3-25).
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
              { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.item, minHeight: size.listItem, paddingHorizontal: space.l },
            ])}
          >
            <Text style={[typography.body, { color: color.text }]}>{t(screen.title)}</Text>
          </Pressable>
        </Link>
      ))}
      <Text style={[typography.label, { color: color.text2, marginTop: space.l }]}>{t('theme.title')}</Text>
      <View accessibilityRole="radiogroup" style={[styles.row, { gap: space.s }]}>
        {THEME_PREFERENCES.map((option) => {
          const selected = option === preference;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setPreference(option)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? color.runBg : color.surface,
                  borderColor: selected ? color.accent : color.cardBorder,
                  borderRadius: radius.pill,
                  minHeight: size.touchMin,
                },
              ]}
            >
              <Text style={[typography.buttonSm, { color: color.text }]}>{t(`theme.${option}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, justifyContent: 'center' },
  row: { flexDirection: 'row' },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
