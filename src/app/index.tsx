import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

/** The device test screens of the M1 prototype. */
const PROTOTYPE_SCREENS: { href: '/prototype/clock' | '/prototype/nfc' | '/prototype/qr'; title: TranslationKey }[] = [
  { href: '/prototype/clock', title: 'prototype.screens.clock' },
  { href: '/prototype/nfc', title: 'prototype.screens.nfc' },
  { href: '/prototype/qr', title: 'prototype.screens.qr' },
];

// Start screen of the prototype: links to the device test screens (M1-03 to M1-06).
export default function Index() {
  const { color, typography, space, radius, size } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: color.bg, padding: space.l, gap: space.m }]}>
      <Text style={[typography.title1, { color: color.text }]}>{t('app.name')}</Text>
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.subtitle')}</Text>
      {PROTOTYPE_SCREENS.map((screen) => (
        <Link key={screen.href} href={screen.href} asChild>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  item: { borderWidth: 1, justifyContent: 'center' },
});
