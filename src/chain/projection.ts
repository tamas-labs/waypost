// The projections of the chain on the device (shifts, rounds, scans, incidents): what the domain and the screens read.
// Each entry is applied in the transaction that writes it, so the projection never disagrees with the chain. The
// server builds the same projections from the pushed chain; these are only the phone's view of its own entries.
import type { ChainEntry } from '@waypost/schema';
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { incidents, rounds, scans, shifts } from '@/db/schema';

/** An entry that does not fit the current projection (a bug in whoever built it); its transaction rolls back. */
export class ProjectionError extends Error {
  override name = 'ProjectionError';
}

function openShift(tx: Database, shiftId: string) {
  const shift = tx.select({ ended_at: shifts.ended_at }).from(shifts).where(eq(shifts.id, shiftId)).get();
  if (shift === undefined) throw new ProjectionError(`Unknown shift ${shiftId}`);
  if (shift.ended_at !== null) throw new ProjectionError(`Shift ${shiftId} is already closed`);
}

function roundStatus(tx: Database, roundId: string) {
  const round = tx.select({ status: rounds.status }).from(rounds).where(eq(rounds.id, roundId)).get();
  if (round === undefined) throw new ProjectionError(`Unknown round ${roundId}`);
  if (round.status !== 'open' && round.status !== 'in_progress') throw new ProjectionError(`Round ${roundId} is already closed`);
  return round.status;
}

/** Applies one entry to the projections. Times of what happened on the phone are the entry's device_time. */
export function applyProjection(tx: Database, entry: ChainEntry): void {
  switch (entry.type) {
    case 'shift_started': {
      const { shift_id, site_id, guard_id } = entry.payload;
      tx.insert(shifts).values({ id: shift_id, site_id, device_id: entry.device_id, guard_id, started_at: entry.device_time, chain_entry_id: entry.id }).run();
      return;
    }
    case 'shift_closed': {
      const { shift_id, closed_by } = entry.payload;
      openShift(tx, shift_id);
      tx.update(shifts).set({ ended_at: entry.device_time, closed_by }).where(eq(shifts.id, shift_id)).run();
      return;
    }
    case 'round_opened': {
      const { round_id, shift_id, route_version_id, schedule_id, scheduled_at, time_limit_min } = entry.payload;
      openShift(tx, shift_id);
      tx.insert(rounds).values({ id: round_id, shift_id, route_version_id, schedule_id, scheduled_at, time_limit_min, status: 'open' }).run();
      return;
    }
    case 'scan': {
      const { scan_id, round_id, checkpoint_id, method, lat_e7, lng_e7, accuracy_dm, is_mock, flags, note } = entry.payload;
      // The first scan of a checkpoint in a round starts it (Kör / Folyamatban); an unknown tag does not.
      if (round_id !== null && roundStatus(tx, round_id) === 'open' && checkpoint_id !== null) {
        tx.update(rounds).set({ status: 'in_progress', started_at: entry.device_time }).where(eq(rounds.id, round_id)).run();
      }
      tx.insert(scans)
        .values({ id: scan_id, round_id, checkpoint_id, method, scanned_at: entry.device_time, lat_e7, lng_e7, accuracy_dm, is_mock, flags, note, chain_entry_id: entry.id })
        .run();
      return;
    }
    case 'incident': {
      const { incident_id, shift_id, category, note, lat_e7, lng_e7, accuracy_dm, nearest_checkpoint_id, scan_id } = entry.payload;
      tx.insert(incidents)
        .values({ id: incident_id, shift_id, category, note, occurred_at: entry.device_time, lat_e7, lng_e7, accuracy_dm, nearest_checkpoint_id, scan_id, chain_entry_id: entry.id })
        .run();
      return;
    }
    case 'round_closed': {
      const { round_id, status, finished_at } = entry.payload;
      roundStatus(tx, round_id);
      tx.update(rounds).set({ status, finished_at }).where(eq(rounds.id, round_id)).run();
      return;
    }
    default: {
      // A new entry type (e.g. sos in stage 2) needs its projection here before it can be written.
      const unknown: never = entry;
      throw new ProjectionError(`No projection for entry type ${(unknown as { type: string }).type}`);
    }
  }
}
