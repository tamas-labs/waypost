// Times the scheduling rules on the phone (J-06): the audit measured them in Node only, and they run on the JS thread.
// slotsBetween is timed apart from the rules, to tell the schedule expansion from the deadline search.
import type { Timestamp } from '@waypost/schema';

import { alarmPlan, roundAlarmInfo } from '@/domain/alarms';
import { schedulerStep } from '@/domain/rounds';
import { slotsBetween, type ScheduleOfRoute } from '@/domain/schedule';
import { shiftHome } from '@/domain/shift-view';
import type { GuardState } from '@/domain/state';
import { parseTimestamp } from '@/time/timestamp';
import { DAY_MS } from '@/time/zone';

const TIMEZONE = 'Europe/Budapest';
const STARTED_AT: Timestamp = '2026-11-03T19:00:00.000Z';
const NOW: Timestamp = '2026-11-03T19:05:00.000Z';
const RUNS = 5;

const uuid = (n: number) => `019a2b3c-4d5e-7f00-8a00-${String(n).padStart(12, '0')}`;
const [SITE, GUARD, SHIFT, ROUND, ROUTE, VERSION, SCHEDULE, CHECKPOINT] = [1, 2, 3, 4, 5, 6, 7, 8].map(uuid) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

function benchmarkState(interval: Pick<ScheduleOfRoute, 'interval_from' | 'interval_to' | 'interval_every_min'>): GuardState {
  return {
    site_id: SITE,
    timezone: TIMEZONE,
    shift: { id: SHIFT, guard_id: GUARD, started_at: STARTED_AT },
    routes: [{ id: ROUTE, order_mode: 'free', current_version_id: VERSION, active: true }],
    schedules: [
      {
        id: SCHEDULE,
        route_id: ROUTE,
        weekdays: 127,
        mode: 'interval',
        start_times: null,
        time_limit_min: null,
        active: true,
        ...interval,
      },
    ],
    versions: [{ id: VERSION, route_id: ROUTE, checkpoint_ids: [CHECKPOINT] }],
    checkpoints: [{ id: CHECKPOINT, tag_uid: '04A1B2C3D4E501', qr_payload: null, lat_e7: null, lng_e7: null, active: true }],
    rounds: [
      {
        id: ROUND,
        shift_id: SHIFT,
        route_id: ROUTE,
        route_version_id: VERSION,
        schedule_id: SCHEDULE,
        scheduled_at: STARTED_AT,
        time_limit_min: null,
        status: 'open',
        scans: [],
      },
    ],
  };
}

export const BENCHMARK_SCHEDULES = [
  { id: 'hourly', interval: { interval_from: '20:00', interval_to: '08:00', interval_every_min: 60 } },
  { id: 'night5', interval: { interval_from: '20:00', interval_to: '08:00', interval_every_min: 5 } },
  { id: 'day5', interval: { interval_from: '00:00', interval_to: '23:55', interval_every_min: 5 } },
] as const;

export const BENCHMARK_RULES = {
  slotsBetween: (state: GuardState) => {
    const nowMs = parseTimestamp(NOW);
    return slotsBetween(state.schedules, state.timezone, nowMs - DAY_MS, nowMs + 2 * DAY_MS);
  },
  schedulerStep: (state: GuardState) => schedulerStep(state, NOW, () => uuid(9)),
  shiftHome: (state: GuardState) => shiftHome(state, NOW),
  alarmPlan: (state: GuardState) => alarmPlan(state, NOW),
  roundAlarmInfo: (state: GuardState) => roundAlarmInfo(state, { route_id: ROUTE, schedule_id: SCHEDULE, scheduled_at: STARTED_AT }, NOW),
} as const;

export type BenchmarkSchedule = (typeof BENCHMARK_SCHEDULES)[number]['id'];
export type BenchmarkRule = keyof typeof BENCHMARK_RULES;

export interface BenchmarkResult {
  schedule: BenchmarkSchedule;
  rule: BenchmarkRule;
  /** The median of the runs, in milliseconds. */
  ms: number;
}

/** The median time of a call: the first run of a rule on Hermes is slower, and a single run shows the garbage collector too. */
function medianMs(call: () => unknown, runs = RUNS): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    call();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
}

/** Every rule on every schedule. It blocks the JS thread while it runs: that is what it measures. */
export function runBenchmark(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  for (const { id, interval } of BENCHMARK_SCHEDULES) {
    const state = benchmarkState(interval);
    for (const rule of Object.keys(BENCHMARK_RULES) as BenchmarkRule[]) {
      results.push({ schedule: id, rule, ms: medianMs(() => BENCHMARK_RULES[rule](state)) });
    }
  }
  return results;
}
