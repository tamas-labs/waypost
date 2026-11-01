// The names the screens of the guard show, from the database.
import { eq } from 'drizzle-orm';

import type { Database } from '@/db/database';
import { routes, users } from '@/db/schema';
import type { GuardState } from '@/domain/state';

export function userName(db: Database, id: string): string | null {
  return db.select({ name: users.name }).from(users).where(eq(users.id, id)).get()?.name ?? null;
}

/** The route's name on a site with several routes that have rounds; null with one, where it says nothing. */
export function routeNameAmongSeveral(db: Database, state: GuardState, routeId: string): string | null {
  const several = state.routes.filter((route) => route.active && route.current_version_id !== null).length > 1;
  if (!several) return null;
  return db.select({ name: routes.name }).from(routes).where(eq(routes.id, routeId)).get()?.name ?? null;
}
