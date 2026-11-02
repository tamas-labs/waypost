import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { formatSyncTime } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import {
  guardsSummary,
  loadSiteDetail,
  reportsSummary,
  routeSummary,
  schedulesSummary,
  supervisorsSummary,
  type SitePhone,
} from '@/supervisor/site-detail';
import { supervisorAccount } from '@/supervisor/sites';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular, type ColorTokens } from '@/theme/tokens';
import { parseTimestamp } from '@/time/timestamp';
import { localDateOf } from '@/time/zone';

// Site details (S3, S-Telephely): the routes, the settings (schedules, guards, reports) in one line each, and the site
// phone. The rows lead to their screens as those are built (M5-12 – M5-19), "Telefon hozzárendelése" comes with M5-09;
// the design's warning about the last problem round needs round data the phone does not get (Q15, M5-20).
export default function SiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession(useShallow(({ mode, activeUser }) => ({ mode, activeUser })));
  const load = useCallback(() => {
    const db = getDatabase();
    const account = supervisorAccount(db, session);
    return { site: loadSiteDetail(db, id, account?.id ?? null), email: account?.email ?? null };
  }, [id, session]);
  const { site, email } = useLiveQuery(load);

  if (site === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('supervisor.siteMissing')} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={site.name} subtitle={supervisorsSummary(site.supervisors)} onBack={() => router.back()} />
      <ScrollView style={styles.grow} contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.xxl, gap: space.m }}>
        <Section title={t('supervisor.routes')}>
          {site.routes.length === 0 ? (
            <Text style={[typography.bodyRegular, { color: color.text2, padding: space.l }]}>{t('supervisor.noRoute')}</Text>
          ) : (
            <Card divided>
              {site.routes.map((route) => (
                <Row key={route.id} title={route.name} subtitle={routeSummary(route)} dimmed={!route.active} />
              ))}
            </Card>
          )}
        </Section>

        <Section title={t('supervisor.settings')}>
          <Card divided>
            <Row tile={{ letter: t('supervisor.schedule') }} title={t('supervisor.schedule')} subtitle={schedulesSummary(site.schedules)} />
            <Row tile={{ letter: t('supervisor.guards') }} title={t('supervisor.guards')} subtitle={guardsSummary(site.guards)} />
            <Row
              tile={{ letter: t('supervisor.reports') }}
              title={t('supervisor.reports')}
              subtitle={reportsSummary(site.reports, email)}
            />
          </Card>
        </Section>

        <Section title={t('supervisor.sitePhone')}>
          <Card divided>
            <PhoneRow phone={site.phone} timeZone={site.timezone} />
          </Card>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { color, typography, space } = useTheme();
  return (
    <View style={{ gap: space.s }}>
      <Text style={[typography.label, { color: color.text2, paddingHorizontal: space.xs, paddingTop: space.s }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

type Tile = { letter: string } | { icon: IconName; fg: keyof ColorTokens; bg: keyof ColorTokens };

/** A row of a grouped card (DESIGN_HANDOFF S3): an optional 36 dp tile, the title and a one-line summary. */
function Row({ tile, title, subtitle, dimmed = false }: { tile?: Tile; title: string; subtitle: string; dimmed?: boolean }) {
  const { color, typography, space, size, radius, iconSize, press } = useTheme();
  return (
    <View
      accessible
      style={[styles.row, { minHeight: size.listItem + space.xs, paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m }]}
    >
      {tile !== undefined && (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[
            styles.tile,
            {
              width: size.iconTile,
              height: size.iconTile,
              borderRadius: radius.tile,
              backgroundColor: 'letter' in tile ? color.runBg : color[tile.bg],
            },
          ]}
        >
          {'letter' in tile ? (
            <Text style={[typography.badge, { color: color.run }]}>{[...tile.letter][0]}</Text>
          ) : (
            <Icon name={tile.icon} size={iconSize.banner} color={color[tile.fg]} />
          )}
        </View>
      )}
      <View style={[styles.grow, dimmed && { opacity: press.disabledOpacity }]}>
        <Text style={[typography.body, { color: color.text }]}>{title}</Text>
        <Text style={[typography.small, tabular, { color: color.text2 }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

function enrolledDate(at: string, timeZone: string): string {
  const [year = '', month = '', day = ''] = localDateOf(parseTimestamp(at), timeZone).split('-');
  return t('supervisor.date', { year, month, day });
}

/**
 * The site phone: its name and platform; on the site phone itself its own sync state (online, last sync, items
 * waiting), elsewhere when it was enrolled, because its last contact does not reach this phone (Q15).
 */
function PhoneRow({ phone, timeZone }: { phone: SitePhone | null; timeZone: string }) {
  const deviceId = useSession((state) => state.deviceId);
  const sync = useSyncStatus(useShallow(({ online, lastSuccessAt, pendingCount }) => ({ online, lastSuccessAt, pendingCount })));
  // When the screen opened: a last sync on another day shows its date too.
  const [openedAt] = useState(() => Date.now());
  if (phone === null) {
    return (
      <Row tile={{ icon: 'phone', fg: 'offFg', bg: 'offBg' }} title={t('supervisor.noPhoneTitle')} subtitle={t('supervisor.noPhoneHint')} />
    );
  }
  const title = t('supervisor.phoneTitle', {
    name: phone.name,
    platform: t(phone.platform === 'ios' ? 'supervisor.platformIos' : 'supervisor.platformAndroid'),
  });
  const subtitle =
    phone.id === deviceId
      ? [
          t('supervisor.thisPhone'),
          t(sync.online === false ? 'sync.offline' : 'sync.online'),
          sync.lastSuccessAt === null
            ? t('supervisor.phoneNeverSynced')
            : t('supervisor.phoneLastSync', { time: formatSyncTime(sync.lastSuccessAt, openedAt, timeZone) }),
          t('supervisor.phonePending', { count: sync.pendingCount }),
        ].join(' · ')
      : t('supervisor.enrolledAt', { date: enrolledDate(phone.enrolled_at, timeZone), version: phone.app_version });
  const offline = phone.id === deviceId && sync.online === false;
  return <Row tile={{ icon: 'phone', fg: offline ? 'offFg' : 'ok', bg: offline ? 'offBg' : 'okBg' }} title={title} subtitle={subtitle} />;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
});
