import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { formatSyncTime } from '@/components/sync-status-indicator';
import { getDatabase } from '@/db/open';
import type { TrainingDraft } from '@/domain/training';
import { useEnrollThisPhone } from '@/hooks/use-enroll-this-phone';
import { useLiveQuery } from '@/hooks/use-live-query';
import { trainingNow } from '@/hooks/use-training';
import { t } from '@/i18n';
import {
  guardsSummary,
  loadSiteDetail,
  reportsSummary,
  routeSummary,
  schedulesSummary,
  supervisorsSummary,
  type SiteDetail,
  type SitePhone,
} from '@/supervisor/site-detail';
import { supervisorAccount } from '@/supervisor/sites';
import { beginTraining, loadTrainingDraft, storedTrainingDraft } from '@/supervisor/training';
import { routeTitle } from '@/supervisor/training-view';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular, type ColorTokens } from '@/theme/tokens';
import { parseTimestamp } from '@/time/timestamp';
import { localDateOf } from '@/time/zone';

// Site details (S3, S-Telephely): the routes with "Új útvonal betanítása" (and the supervisor's unfinished training of
// the site, to continue), the settings (schedules, guards, reports) in one line each, and the site phone, with "Telefon
// hozzárendelése" on a supervisor's own phone (M5-09). A route leads to its editing (S7), the schedule row to a route's
// schedule (S8, a choice of the route if the site has more), the guards row to the guards and PINs (S9), the reports
// row to the report settings (S10); the design's warning about the last problem round needs round data the phone does not get (a later stage).
export default function SiteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color, typography, space } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession(useShallow(({ mode, activeUser }) => ({ mode, activeUser })));
  const load = useCallback(() => {
    const db = getDatabase();
    const account = supervisorAccount(db, session);
    return { site: loadSiteDetail(db, id, account?.id ?? null), email: account?.email ?? null, supervisorId: account?.id ?? null };
  }, [id, session]);
  const { site, email, supervisorId } = useLiveQuery(load);
  const [pickingRoute, setPickingRoute] = useState(false);

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
          {site.routes.length === 0 && (
            <Text style={[typography.bodyRegular, { color: color.text2, paddingHorizontal: space.l, paddingVertical: space.s }]}>
              {t('supervisor.noRoute')}
            </Text>
          )}
          <Card divided>
            {site.routes.map((route) => (
              <Row
                key={route.id}
                title={route.name}
                subtitle={routeSummary(route)}
                dimmed={!route.active}
                // A route without a version on the phone has nothing to edit yet.
                onPress={
                  route.version === null ? undefined : () => router.push({ pathname: '/routes/[id]/edit', params: { id: route.id } })
                }
              />
            ))}
            {supervisorId !== null && <TrainingRows siteId={site.id} supervisorId={supervisorId} />}
          </Card>
        </Section>

        <Section title={t('supervisor.settings')}>
          <Card divided>
            <Row
              tile={{ letter: t('supervisor.schedule') }}
              title={t('supervisor.schedule')}
              subtitle={schedulesSummary(site.schedules)}
              // A schedule is a route's: one route leads to it, more to a choice; no route, nothing to schedule.
              onPress={
                site.routes.length === 0
                  ? undefined
                  : site.routes.length === 1
                    ? () => openSchedule(site.routes[0]!.id)
                    : () => setPickingRoute(true)
              }
            />
            <Row
              tile={{ letter: t('supervisor.guards') }}
              title={t('supervisor.guards')}
              subtitle={guardsSummary(site.guards)}
              onPress={() => router.push({ pathname: '/sites/[id]/guards', params: { id: site.id } })}
            />
            <Row
              tile={{ letter: t('supervisor.reports') }}
              title={t('supervisor.reports')}
              subtitle={reportsSummary(site.reports, email)}
              onPress={() => router.push({ pathname: '/sites/[id]/reports', params: { id: site.id } })}
            />
          </Card>
        </Section>

        <Section title={t('supervisor.sitePhone')}>
          <Card divided>
            <PhoneRow phone={site.phone} timeZone={site.timezone} />
          </Card>
          {session.mode === 'supervisor_phone' && <EnrollThisPhone siteId={site.id} siteName={site.name} phone={site.phone} />}
        </Section>
      </ScrollView>
      <Modal
        visible={pickingRoute}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPickingRoute(false)}
      >
        <RoutePicker
          site={site}
          onPick={(routeId) => {
            setPickingRoute(false);
            openSchedule(routeId);
          }}
          onClose={() => setPickingRoute(false)}
        />
      </Modal>
    </View>
  );
}

const openSchedule = (routeId: string) => router.push({ pathname: '/routes/[id]/schedule', params: { id: routeId } });

/** The routes of the site with their schedules in one line each, to choose whose schedule to edit (S8). */
function RoutePicker({ site, onPick, onClose }: { site: SiteDetail; onPick: (routeId: string) => void; onClose: () => void }) {
  const { color, typography, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.grow}>
      <Pressable
        style={[styles.grow, { backgroundColor: color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }]}>
        <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}>
          <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
            {t('scheduleEdit.pickRoute')}
          </Text>
          <Card divided>
            {site.routes.map((route) => (
              <Row
                key={route.id}
                title={route.name}
                subtitle={schedulesSummary(site.schedules.filter((schedule) => schedule.route_id === route.id))}
                dimmed={!route.active}
                onPress={() => onPick(route.id)}
              />
            ))}
          </Card>
          <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
        </ScrollView>
      </View>
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

/**
 * The supervisor's unfinished training of this site (kept on the phone until it is saved or discarded) to continue, and
 * "Új útvonal betanítása", which replaces a draft after a confirmation: the phone keeps one.
 */
function TrainingRows({ siteId, supervisorId }: { siteId: string; supervisorId: string }) {
  const [draft, setDraft] = useState<TrainingDraft | null>(null);
  // Loaded again when the training gives way: it may have been saved or discarded.
  useFocusEffect(useCallback(() => setDraft(loadTrainingDraft(getDatabase(), supervisorId)), [supervisorId]));
  const open = (routeId: string) => router.push({ pathname: '/routes/[id]/train', params: { id: routeId } });

  const startNew = () => {
    const begin = () => open(beginTraining(getDatabase(), { siteId, routeId: null, supervisorId, started: trainingNow() }).route.id);
    const stored = storedTrainingDraft(getDatabase());
    if (stored === null || stored.points.length === 0) {
      begin();
      return;
    }
    Alert.alert(t('supervisor.replaceTrainingTitle'), t('supervisor.replaceTraining', { count: stored.points.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('supervisor.replaceTrainingButton'), style: 'destructive', onPress: begin },
    ]);
  };

  return (
    <>
      {draft !== null && draft.site_id === siteId && (
        <Row
          tile={{ icon: 'nfc', fg: 'run', bg: 'runBg' }}
          title={t('supervisor.continueTraining')}
          subtitle={t('supervisor.continueTrainingLine', { route: routeTitle(draft), count: draft.points.length })}
          onPress={() => open(draft.route.id)}
        />
      )}
      <ActionRow label={t('supervisor.trainNewRoute')} onPress={startNew} />
    </>
  );
}

/** The last row of a card that adds something (S3 "Új útvonal betanítása"): a plus and the accent label. */
function ActionRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { color, typography, space, size, iconSize } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { minHeight: size.buttonDashed, paddingHorizontal: space.l, gap: space.s }]}
    >
      <Icon name="plus" size={iconSize.banner} color={color.accent} />
      <Text style={[typography.buttonSm, { color: color.accent }]}>{label}</Text>
    </Pressable>
  );
}

type Tile = { letter: string } | { icon: IconName; fg: keyof ColorTokens; bg: keyof ColorTokens };

/** A row of a grouped card (DESIGN_HANDOFF S3): an optional 36 dp tile, the title and a one-line summary. */
function Row({
  tile,
  title,
  subtitle,
  dimmed = false,
  onPress,
}: {
  tile?: Tile;
  title: string;
  subtitle: string;
  dimmed?: boolean;
  onPress?: () => void;
}) {
  const { color, typography, space, size, radius, iconSize, press } = useTheme();
  const rowStyle = [
    styles.row,
    { minHeight: size.listItem + space.xs, paddingHorizontal: space.l, paddingVertical: space.m, gap: space.m },
  ];
  const content = (
    <>
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
    </>
  );
  // A row that leads nowhere yet is not announced as a disabled button.
  if (onPress === undefined) {
    return (
      <View accessible style={rowStyle}>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={rowStyle}>
      {content}
    </Pressable>
  );
}

/**
 * "Telefon hozzárendelése" (specification, Telephelyi telefon hozzárendelése): on the supervisor's own phone, online,
 * after a confirmation that tells what happens (and that the site's phone is replaced, if it has one).
 */
function EnrollThisPhone({ siteId, siteName, phone }: { siteId: string; siteName: string; phone: SitePhone | null }) {
  const { color, typography, space } = useTheme();
  const offline = useSyncStatus((state) => state.online === false);
  const { enroll, busy, error } = useEnrollThisPhone(siteId);
  const confirm = () => {
    const message = [
      t('supervisor.enrollConfirm', { site: siteName }),
      ...(phone === null ? [] : [t('supervisor.enrollReplaces', { phone: phone.name })]),
    ].join(' ');
    Alert.alert(t('supervisor.enrollConfirmTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('supervisor.enrollConfirmButton'), onPress: () => void enroll() },
    ]);
  };
  return (
    <View style={{ gap: space.s }}>
      <Button
        label={busy ? t('supervisor.enrolling') : t('supervisor.enroll')}
        variant="secondary"
        icon="phone"
        disabled={busy || offline}
        onPress={confirm}
      />
      {offline && (
        <Text style={[typography.small, { color: color.text2, paddingHorizontal: space.xs }]}>{t('supervisor.enrollOffline')}</Text>
      )}
      {error !== null && (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert">
          <InfoBanner variant="error" text={error} />
        </View>
      )}
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
  sheet: { maxHeight: '92%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  tile: { alignItems: 'center', justifyContent: 'center' },
});
