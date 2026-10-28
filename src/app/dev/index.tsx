import { Link, Stack, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useSession } from '@/auth/session';
import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

const SCREENS: { href: Href; title: TranslationKey }[] = [
  { href: '/dev/enroll', title: 'dev.screens.enroll' },
  { href: '/prototype/clock', title: 'prototype.screens.clock' },
  { href: '/prototype/nfc', title: 'prototype.screens.nfc' },
  { href: '/prototype/qr', title: 'prototype.screens.qr' },
  { href: '/prototype/alarms', title: 'prototype.screens.alarms' },
];

// Developer tools: the developer enrollment (M3-06) and the device test screens of the M1 prototype.
export default function DevToolsScreen() {
  const { color, typography, space, radius, size } = useTheme();
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, justifyContent: 'center' },
});
