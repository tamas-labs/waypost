import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { ScreenHeader } from './screen-header';

/** A screen of the navigation skeleton whose content comes in a later task; in development builds it links to the developer tools. */
export function PlaceholderScreen({ title }: { title: string }) {
  const { color, typography, space, radius, size } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: color.bg }]}>
      <ScreenHeader />
      <View style={{ padding: space.l, gap: space.m }}>
        <Text style={[typography.title1, { color: color.text }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('placeholder.notReady')}</Text>
        {__DEV__ && (
          <Link href="/dev" asChild>
            <Pressable
              // Link asChild needs a flat style object.
              style={StyleSheet.flatten([
                styles.button,
                { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.item, minHeight: size.listItem, paddingHorizontal: space.l },
              ])}
            >
              <Text style={[typography.body, { color: color.text }]}>{t('dev.title')}</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  button: { borderWidth: 1, justifyContent: 'center' },
});
