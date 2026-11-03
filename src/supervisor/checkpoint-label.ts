// The QR label of a checkpoint ((supervisor)/checkpoints/[id]/qr): what the phone has of the point for it. The QR
// payload is the server's (it makes one for every checkpoint created without it, decisions: "Betanítás – domain"), so a
// point trained on this phone has none until the server's response or a pull brings it.
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { checkpoints, sites } from '@/db/schema';

export interface CheckpointLabel {
  id: string;
  name: string;
  /** The site's name; null if the phone does not have the site. */
  site_name: string | null;
  tag_type: 'nfc' | 'nfc_dna' | 'qr';
  active: boolean;
  /** null: the server has not given one yet. */
  qr_payload: string | null;
}

/** The checkpoint's label data, or null if the phone does not have the checkpoint. */
export function loadCheckpointLabel(db: Database, checkpointId: string): CheckpointLabel | null {
  const row = db
    .select({
      id: checkpoints.id,
      name: checkpoints.name,
      site_name: sites.name,
      tag_type: checkpoints.tag_type,
      active: checkpoints.active,
      qr_payload: checkpoints.qr_payload,
    })
    .from(checkpoints)
    .leftJoin(sites, eq(sites.id, checkpoints.site_id))
    .where(eq(checkpoints.id, checkpointId))
    .get();
  return row ?? null;
}
