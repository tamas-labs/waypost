import { homeHref, routeAccess } from './access';

const GUARD = { id: '01900000-0000-7000-8000-0000000000a1', role: 'guard' as const };
const SUPERVISOR = { id: '01900000-0000-7000-8000-0000000000a2', role: 'supervisor' as const };

describe('route access', () => {
  it('waits while the session is loading', () => {
    expect(routeAccess({ mode: null, activeUser: null })).toEqual({ login: false, pin: false, guard: false, supervisor: false });
    expect(homeHref({ mode: null, activeUser: null })).toBeNull();
  });

  it('opens only the supervisor login on a phone that is not enrolled', () => {
    expect(routeAccess({ mode: 'unassigned', activeUser: null })).toEqual({ login: true, pin: false, guard: false, supervisor: false });
    expect(homeHref({ mode: 'unassigned', activeUser: null })).toBe('/login');
  });

  it('opens the PIN login on the site phone, then the mode of the logged-in user', () => {
    expect(routeAccess({ mode: 'site_phone', activeUser: null })).toEqual({ login: false, pin: true, guard: false, supervisor: false });
    expect(homeHref({ mode: 'site_phone', activeUser: null })).toBe('/pin');
    expect(routeAccess({ mode: 'site_phone', activeUser: GUARD })).toEqual({ login: false, pin: false, guard: true, supervisor: false });
    expect(homeHref({ mode: 'site_phone', activeUser: GUARD })).toBe('/home');
    expect(routeAccess({ mode: 'site_phone', activeUser: SUPERVISOR })).toEqual({ login: false, pin: false, guard: false, supervisor: true });
    expect(homeHref({ mode: 'site_phone', activeUser: SUPERVISOR })).toBe('/sites');
  });

  it("opens the site list on a supervisor's own phone, without guard mode", () => {
    expect(routeAccess({ mode: 'supervisor_phone', activeUser: null })).toEqual({ login: false, pin: false, guard: false, supervisor: true });
    expect(homeHref({ mode: 'supervisor_phone', activeUser: null })).toBe('/sites');
  });
});
