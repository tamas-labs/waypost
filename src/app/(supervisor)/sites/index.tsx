import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session';
import { AccountButton } from '@/components/account-button';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { StatusBadge } from '@/components/status-badge';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { needsSetup, setupRows } from '@/device/readiness';
import { getDatabase } from '@/db/open';
import { useAccountMenu } from '@/hooks/use-account-menu';
import { useLiveQuery } from '@/hooks/use-live-query';
import { useReadiness } from '@/hooks/use-readiness';
import { t } from '@/i18n';
import { loadSiteList, supervisorAccount, type SiteListItem } from '@/supervisor/sites';
import { dismissOutboxRejections } from '@/sync/outbox';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

function routeLine(routes: SiteListItem['routes']): string {
  const [first] = routes;
  if (first === undefined) return t('supervisor.noRoute');
  if (routes.length === 1) return t('supervisor.routeOne', { name: first.name, points: first.points });
  return t('supervisor.routeMany', { count: routes.length, points: routes.reduce((sum, route) => sum + route.points, 0) });
}

const loadSites = () => loadSiteList(getDatabase());

// Sites (S2, S-Telephelyek): the supervisor's sites (on the site phone its own), each opening its details (S3), the account button with the way out,
// the actions the server refused, and "Új telephely" on the supervisor's own phone (the site phone cannot create one).
// On the site phone a missing setting of the device setup (M5-10) warns here too: the PIN screen sends the guard to a
// supervisor for it.
export default function SitesScreen() {
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useSession((state) => state.mode);
  const activeUser = useSession((state) => state.activeUser);
  const siteList = useLiveQuery(loadSites);
  // The account follows the session: a pull may also bring the name of the supervisor of the PIN.
  const loadAccount = useCallback(() => supervisorAccount(getDatabase(), { mode, activeUser }), [mode, activeUser]);
  const account = useLiveQuery(loadAccount);
  const [openAccount, leaving] = useAccountMenu(account);
  const ownPhone = mode === 'supervisor_phone';

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader
        right={
          <View style={[styles.row, { gap: space.s }]}>
            <SyncStatusIndicator />
            <AccountButton name={account?.name ?? null} onPress={openAccount} />
          </View>
        }
      />
      <ScrollView
        style={styles.grow}
        contentContainerStyle={[styles.content, { padding: space.l, paddingBottom: insets.bottom + space.xxl, gap: space.m }]}
      >
        <Text style={[typography.title1, { color: color.text, paddingHorizontal: space.xs }]} accessibilityRole="header">
          {t('supervisor.sites')}
        </Text>

        {mode === 'site_phone' && <SetupWarning />}

        <RejectedCalls />

        {siteList.length === 0 ? (
          <Text style={[typography.bodyRegular, { color: color.text2, paddingHorizontal: space.xs }]}>
            {ownPhone ? `${t('supervisor.sitesEmpty')} ${t('supervisor.sitesEmptyCreate')}` : t('supervisor.sitesEmpty')}
          </Text>
        ) : (
          siteList.map((site) => <SiteCard key={site.id} site={site} />)
        )}

        {ownPhone && (
          <Button
            label={t('supervisor.newSite')}
            variant="dashed"
            disabled={leaving}
            onPress={() => router.push('/sites/new')}
            style={styles.bottom}
          />
        )}
      </ScrollView>
    </View>
  );
}

/** A site card (DESIGN_HANDOFF S2) with what the phone knows: the name, the routes, the site phone; it opens the site. */
function SiteCard({ site }: { site: SiteListItem }) {
  const { color, typography, space, press } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/sites/[id]', params: { id: site.id } })}
      style={({ pressed }) => pressed && { opacity: press.opacity, transform: [{ scale: press.scale }] }}
    >
      <Card>
        <View style={[styles.row, styles.top, { gap: space.m }]}>
          <View style={[styles.grow, { gap: space.xs / 2 }]}>
            <Text style={[typography.cardTitle, { color: color.text }]}>{site.name}</Text>
            <Text style={[typography.rowLabel, tabular, { color: color.text2 }]}>{routeLine(site.routes)}</Text>
          </View>
          {site.phone === null && <StatusBadge status="pending" label={t('supervisor.noPhone')} />}
        </View>
        {(site.phone !== null || site.pending) && (
          <View style={[styles.row, styles.between, { gap: space.m }]}>
            <Text style={[typography.small, styles.shrink, { color: color.text2 }]}>
              {site.phone === null ? '' : t('supervisor.phoneName', { name: site.phone.name })}
            </Text>
            {site.pending && <Text style={[typography.small, { color: color.offFg }]}>{t('supervisor.sitePending')}</Text>}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

/** The site phone misses a setting of the device setup checklist; the button opens it. */
function SetupWarning() {
  const { readiness } = useReadiness();
  const { space } = useTheme();
  if (readiness === null || !needsSetup(setupRows(readiness, 'site_phone'))) return null;
  return (
    <View style={{ gap: space.s }}>
      <InfoBanner variant="warn" title={t('deviceSetup.missingTitle')} text={t('deviceSetup.missing')} />
      <Button label={t('deviceSetup.title')} variant="secondary" onPress={() => router.push('/device-setup')} />
    </View>
  );
}

/** The supervisor actions the server refused (outbox, M5-03): they stay here until the supervisor has seen them. */
function RejectedCalls() {
  const rejected = useSyncStatus((state) => state.rejectedCalls);
  const { space } = useTheme();
  if (rejected.length === 0) return null;
  return (
    <View style={{ gap: space.s }}>
      <InfoBanner
        variant="warn"
        title={t('supervisor.rejectedMany', { count: rejected.length })}
        text={rejected.map((call) => call.message).join('\n')}
      />
      <Button label={t('supervisor.rejectedDismiss')} variant="secondary" onPress={() => dismissOutboxRejections(getDatabase())} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  top: { alignItems: 'flex-start' },
  between: { justifyContent: 'space-between' },
  // "Új telephely" sits low, near the thumb, under a short list.
  bottom: { marginTop: 'auto' },
});
