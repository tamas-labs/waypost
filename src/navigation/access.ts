import type { Href } from 'expo-router';

import type { SessionState } from '@/auth/session';

type Session = Pick<SessionState, 'mode' | 'activeUser'> & Partial<Pick<SessionState, 'shiftStart'>>;

/** Which route groups the session may open (the guards of Stack.Protected). */
export function routeAccess({ mode, activeUser }: Session) {
  return {
    /** Supervisor login: only on a phone that is not enrolled. */
    login: mode === 'unassigned',
    /** PIN login: on the site phone while nobody is logged in. */
    pin: mode === 'site_phone' && activeUser === null,
    guard: mode === 'site_phone' && activeUser?.role === 'guard',
    /** A supervisor's own phone, or a supervisor logged in with a PIN on the site phone. */
    supervisor: mode === 'supervisor_phone' || (mode === 'site_phone' && activeUser?.role === 'supervisor'),
  };
}

/** The start screen of the session; null while it is loading. */
export function homeHref(session: Session): Href | null {
  const access = routeAccess(session);
  if (access.login) return '/login';
  if (access.pin) return '/pin';
  if (access.guard) return session.shiftStart == null ? '/home' : '/shift-start';
  if (access.supervisor) return '/sites';
  return null;
}
