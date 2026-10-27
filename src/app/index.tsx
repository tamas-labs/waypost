import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

// Start screen of the prototype; the prototype screens (M1-03 to M1-06) are linked from here.
export default function Index() {
  const { color, typography, space } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: color.bg, padding: space.l }]}>
      <Text style={[typography.title1, { color: color.text }]}>{t('app.name')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
