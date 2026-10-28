import { Redirect } from 'expo-router';

import { useSession } from '@/auth/session';
import { homeHref } from '@/navigation/access';

// The start route: sends the session to its start screen (supervisor login, PIN, shift home or site list).
export default function Index() {
  const href = useSession(homeHref);
  return href === null ? null : <Redirect href={href} />;
}
