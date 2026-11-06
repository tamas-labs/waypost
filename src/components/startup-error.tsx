import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

/** Shown if the database could not be opened or migrated at start, or (with its heading) if the screens crashed. */
export function StartupError({
  error,
  onRetry,
  heading = 'startup.failed',
}: {
  error: unknown;
  onRetry: () => void;
  heading?: TranslationKey;
}) {
  const { color, typography, space, radius, size } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: color.bg, padding: space.l, gap: space.m }]}>
      <Text style={[typography.title2, { color: color.miss }]} accessibilityRole="alert">
        {t(heading)}
      </Text>
      <Text style={[typography.small, { color: color.text2 }]} selectable>
        {error instanceof Error ? error.message : String(error)}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: color.surface, borderRadius: radius.pill, minHeight: size.buttonSecondary }]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={[typography.buttonSm, { color: color.text }]}>{t('startup.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  button: { alignItems: 'center', justifyContent: 'center' },
});
