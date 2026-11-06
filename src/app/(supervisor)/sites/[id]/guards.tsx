import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { Button } from '@/components/button';
import { AttachPick, ConflictBanner, NewGuardName, NewSupervisorForm } from '@/components/guards/guard-sheets';
import { OwnPinRow, PersonRow } from '@/components/guards/person-row';
import { PinPanel, type Person, type Reveal } from '@/components/guards/pin-panel';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { Sheet, SheetModal } from '@/components/sheet';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import {
  attachGuard,
  changePin,
  createGuard,
  createSupervisor,
  freshPin,
  loadSiteGuards,
  setGuardActive,
  type PinConflict,
  type UserRole,
} from '@/supervisor/guards';
import { guardLine, ownPinLine, supervisorLine } from '@/supervisor/guards-view';
import { supervisorAccount } from '@/supervisor/sites';
import { dismissOutboxRejection } from '@/sync/outbox';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';

/** The sheets: a new guard or supervisor (their name and login, then the PIN), one of another site (whom, then the PIN). */
type OpenSheet = { kind: 'create'; role: UserRole; conflict: string | null } | { kind: 'attach' };

const errorText = (e: unknown) => t('guards.failed', { message: e instanceof Error ? e.message : String(e) });

// The guards, supervisors and PINs of a site (S9, S-Orok; the design's sites/[id]/guards, specification:
// (supervisor)/users): the guards with their PIN and shifts, the other supervisors with their PIN, a row opened for a
// new PIN or a suspension, a suspended one let in again by its switch; the supervisor's own PIN; "Új őr", "Új
// supervisor" and one of another site assigned here. A PIN is generated on the phone and shown once: "Kész" saves it
// (the outbox; on the site phone it works at once), "Újat generál" draws another. A PIN the server refused as taken
// (409) is told with a way to a new one.
export default function GuardsScreen() {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const session = useSession(useShallow(({ mode, activeUser }) => ({ mode, activeUser })));
  // The refused calls change without a pull (a 409 arriving, one dismissed here): the conflicts follow them.
  const rejections = useSyncStatus((state) => state.rejectedCalls);
  const load = useCallback(() => {
    const db = getDatabase();
    const account = supervisorAccount(db, session);
    return loadSiteGuards(db, id, account === null ? null : { id: account.id, name: account.name }, rejections);
  }, [id, session, rejections]);
  const data = useLiveQuery(load);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [busy, setBusy] = useState<'generating' | 'saving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // When the screen opened: "ma" and "tegnap" of the last shifts.
  const [openedAt] = useState(() => Date.now());

  if (data === null) {
    return (
      <View style={[styles.grow, { backgroundColor: color.bg }]}>
        <ScreenHeader title={t('guards.title')} onBack={() => router.back()} />
        <View style={{ padding: space.l }}>
          <InfoBanner variant="warn" text={t('guards.missing')} />
        </View>
      </View>
    );
  }
  const siteId = data.site.id;

  /** Draws a PIN not taken on the user's sites and this one, then shows it. */
  const showNewPin = async (userId: string | null, show: (pin: string) => void) => {
    setBusy('generating');
    setError(null);
    try {
      show(await freshPin(getDatabase(), { siteIds: [siteId], userId }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const regenerate = (current: Reveal) =>
    void showNewPin(current.kind === 'create' ? null : current.user.id, (pin) => setReveal({ ...current, pin }));

  const save = async (current: Reveal) => {
    setBusy('saving');
    setError(null);
    const db = getDatabase();
    try {
      if (current.kind === 'change') await changePin(db, current.user.id, current.pin);
      else if (current.kind === 'create' && current.role === 'supervisor')
        await createSupervisor(db, { siteId, name: current.name, ...current.login, pin: current.pin });
      else if (current.kind === 'create') await createGuard(db, { siteId, name: current.name, pin: current.pin });
      else await attachGuard(db, { siteId, userId: current.user.id, pin: current.pin });
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
      return;
    }
    if (current.conflict !== null) dismissOutboxRejection(db, current.conflict);
    setBusy(null);
    setReveal(null);
    setSheet(null);
    setOpenRow(null);
    showToast(
      current.kind === 'change'
        ? t('guards.pinChanged')
        : current.kind === 'create'
          ? t('guards.created', { name: current.name })
          : t('guards.attached', { name: current.user.name }),
    );
  };

  const cancelReveal = () => {
    setReveal(null);
    setSheet(null);
    setError(null);
  };

  const changeOf = (user: Person, own: boolean, conflict: string | null = null) =>
    void showNewPin(user.id, (pin) => setReveal({ kind: 'change', user, own, pin, conflict }));

  const suspend = (person: Person) =>
    Alert.alert(t('guards.suspendTitle', { name: person.name }), t('guards.suspendConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('guards.suspend'),
        style: 'destructive',
        onPress: () => {
          setGuardActive(getDatabase(), person.id, false);
          setOpenRow(null);
        },
      },
    ]);

  const retry = (conflict: PinConflict) => {
    if (conflict.kind === 'create' || conflict.user === null) {
      setSheet({ kind: 'create', role: 'guard', conflict: conflict.call_id });
      return;
    }
    const user = conflict.user;
    if (conflict.kind === 'pin') {
      setOpenRow(user.id);
      changeOf(user, user.id === data.me?.id, conflict.call_id);
    } else {
      void showNewPin(user.id, (pin) => {
        setReveal({ kind: 'attach', user, pin, conflict: conflict.call_id });
        setSheet({ kind: 'attach' });
      });
    }
  };

  const inlineReveal = (userId: string) =>
    reveal?.kind === 'change' && reveal.user.id === userId ? (
      <PinPanel
        reveal={reveal}
        busy={busy}
        onRegenerate={() => regenerate(reveal)}
        onDone={() => void save(reveal)}
        onCancel={cancelReveal}
      />
    ) : null;

  /** A guard's or another supervisor's row: opened for a new PIN or a suspension, a suspended one let in again. */
  const personRow = (person: Person & { active: boolean }, line: string) => (
    <PersonRow
      key={person.id}
      person={person}
      line={line}
      open={openRow === person.id}
      onToggle={() => {
        setOpenRow(openRow === person.id ? null : person.id);
        if (reveal?.kind === 'change') setReveal(null);
      }}
      onActivate={() => setGuardActive(getDatabase(), person.id, true)}
    >
      {inlineReveal(person.id) ?? (
        <View style={{ gap: space.s }}>
          <Button
            variant="secondary"
            label={busy === 'generating' ? t('guards.generating') : t('guards.newPin')}
            disabled={busy !== null}
            onPress={() => changeOf(person, false)}
          />
          <Button variant="dangerText" label={t('guards.suspend')} onPress={() => suspend(person)} />
        </View>
      )}
    </PersonRow>
  );

  const createSheet = (role: UserRole, conflict: string | null) =>
    role === 'supervisor' ? (
      <NewSupervisorForm
        busy={busy !== null}
        onNext={(name, login) =>
          void showNewPin(null, (pin) => setReveal({ kind: 'create', role: 'supervisor', name, login, pin, conflict }))
        }
        onCancel={cancelReveal}
      />
    ) : (
      <NewGuardName
        busy={busy !== null}
        onNext={(name) => void showNewPin(null, (pin) => setReveal({ kind: 'create', role: 'guard', name, pin, conflict }))}
        onCancel={cancelReveal}
      />
    );

  return (
    <View style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('guards.title')} subtitle={data.site.name} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}>
        {data.pinConflicts.map((conflict) => (
          <ConflictBanner
            key={conflict.call_id}
            conflict={conflict}
            onRetry={() => retry(conflict)}
            onDismiss={() => dismissOutboxRejection(getDatabase(), conflict.call_id)}
          />
        ))}

        {data.guards.length === 0 && <InfoBanner variant="info" text={t('guards.none')} />}
        {data.guards.map((guard) => personRow(guard, guardLine(guard, openedAt, data.site.timezone)))}

        {data.supervisors.length > 0 && (
          <>
            <SectionTitle text={t('guards.supervisors')} />
            {data.supervisors.map((supervisor) => personRow(supervisor, supervisorLine(supervisor)))}
          </>
        )}

        {data.me !== null && (
          <>
            <SectionTitle text={t('guards.supervisorOnPhone')} />
            <OwnPinRow
              line={ownPinLine(data.me)}
              busy={busy !== null}
              onChange={() => {
                const me = data.me!;
                setOpenRow(me.id);
                changeOf(me, true);
              }}
            >
              {inlineReveal(data.me.id)}
            </OwnPinRow>
          </>
        )}

        {error !== null && sheet === null && (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert">
            <InfoBanner variant="error" text={error} />
          </View>
        )}
        {data.attachable.length > 0 && (
          <Button
            variant="secondary"
            label={data.attachable.some((person) => person.role === 'supervisor') ? t('guards.attachAny') : t('guards.attach')}
            onPress={() => setSheet({ kind: 'attach' })}
          />
        )}
        <Button icon="plus" label={t('guards.newGuard')} onPress={() => setSheet({ kind: 'create', role: 'guard', conflict: null })} />
        <Button
          variant="secondary"
          icon="plus"
          label={t('guards.newSupervisor')}
          onPress={() => setSheet({ kind: 'create', role: 'supervisor', conflict: null })}
        />
      </ScrollView>

      <SheetModal visible={sheet !== null} onClose={cancelReveal}>
        {sheet !== null && (
          <Sheet form onClose={cancelReveal}>
            {reveal !== null && reveal.kind !== 'change' ? (
              <PinPanel
                reveal={reveal}
                busy={busy}
                onRegenerate={() => regenerate(reveal)}
                onDone={() => void save(reveal)}
                onCancel={cancelReveal}
              />
            ) : sheet.kind === 'create' ? (
              createSheet(sheet.role, sheet.conflict)
            ) : (
              <AttachPick
                people={data.attachable}
                busy={busy !== null}
                onPick={(user) => void showNewPin(user.id, (pin) => setReveal({ kind: 'attach', user, pin, conflict: null }))}
                onCancel={cancelReveal}
              />
            )}
            {error !== null && (
              <View accessibilityLiveRegion="polite" accessibilityRole="alert">
                <InfoBanner variant="error" text={error} />
              </View>
            )}
          </Sheet>
        )}
      </SheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
