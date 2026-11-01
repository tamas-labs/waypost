import { BENCHMARK_RULES, BENCHMARK_SCHEDULES, runBenchmark } from './benchmark';

test('times every rule on every schedule', () => {
  const results = runBenchmark();
  expect(results).toHaveLength(BENCHMARK_SCHEDULES.length * Object.keys(BENCHMARK_RULES).length);
  for (const { ms } of results) expect(ms).toBeGreaterThanOrEqual(0);
});
