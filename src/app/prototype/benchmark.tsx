import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { BENCHMARK_RULES, BENCHMARK_SCHEDULES, runBenchmark, type BenchmarkResult } from '@/guard/benchmark';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

// J-06 device test: how long the scheduling rules take on the phone with the three schedules of the audit.
export default function BenchmarkScreen() {
  const { color, typography, space, radius, border } = useTheme();
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);
  const rules = Object.keys(BENCHMARK_RULES) as (keyof typeof BENCHMARK_RULES)[];
  const card = {
    backgroundColor: color.surface,
    borderColor: color.cardBorder,
    borderWidth: border.thin,
    borderRadius: radius.card,
    padding: space.l,
    gap: space.s,
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
      <Stack.Screen options={{ title: t('prototype.benchmark.title') }} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('prototype.benchmark.hint')}</Text>
      <Button label={t('prototype.benchmark.run')} onPress={() => setResults(runBenchmark())} />
      {results !== null &&
        BENCHMARK_SCHEDULES.map(({ id }) => (
          <View key={id} style={card}>
            <Text style={[typography.title2, { color: color.text }]}>{t(`prototype.benchmark.schedules.${id}`)}</Text>
            {rules.map((rule) => {
              const ms = results.find((result) => result.schedule === id && result.rule === rule)?.ms ?? 0;
              return (
                <View key={rule} style={styles.row}>
                  <Text style={[typography.body, { color: color.text2 }]}>{rule}</Text>
                  <Text style={[typography.body, tabular, { color: color.text }]}>
                    {t('prototype.benchmark.ms', { ms: ms.toFixed(1) })}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
