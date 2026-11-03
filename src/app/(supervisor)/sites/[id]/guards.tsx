import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { useSession } from '@/auth/session';
import { monogram } from '@/components/account-button';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { Switch } from '@/components/switch';
import { TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { formatPin } from '@/domain/pin-generate';
import { useLiveQuery } from '@/hooks/use-live-query';
import { t } from '@/i18n';
import {
  GUARD_NAME_MAX,
  attachGuard,
  changePin,
  createGuard,
  freshPin,
  guardName,
  loadSiteGuards,
  setGuardActive,
  type PinConflict,
  type SiteGuard,
} from '@/supervisor/guards';
import { conflictText, guardLine, ownPinLine } from '@/supervisor/guards-view';
import { supervisorAccount } from '@/supervisor/sites';
import { dismissOutboxRejection } from '@/sync/outbox';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

interface Person {
  id: string;
  name: string;
}

/** A new PIN on the screen, not saved yet: "Kész" saves it, until then nothing has changed. */
type Reveal =
  | { kind: 'change'; user: Person; own: boolean; pin: string; conflict: string | null }
  | { kind: 'create'; name: string; pin: string; conflict: string | null }
  | { kind: 'attach'; user: Person; pin: string; conflict: string | null };

/** The sheets: a new guard (their name, then the PIN), a guard of another site (whom, then the PIN). */
type Sheet = { kind: 'create'; conflict: string | null } | { kind: 'attach' };

const errorText = (e: unknown) => t('guards.failed', { message: e instanceof Error ? e.message : String(e) });

// The guards and PINs of a site (S9, S-Orok; the design's sites/[id]/guards, specification: (supervisor)/users): the
// guards with their PIN and shifts, a row opened for a new PIN or a suspension, a suspended guard let in again by its
// switch; the supervisor's own PIN; "Új őr" and a guard of another site assigned here. A PIN is generated on the phone
// and shown once: "Kész" saves it (the outbox; on the site phone it works at once), "Újat generál" draws another. A PIN
// the server refused as taken (409) is told with a way to a new one.
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
  const [sheet, setSheet] = useState<Sheet | null>(null);
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

  const suspend = (guard: SiteGuard) =>
    Alert.alert(t('guards.suspendTitle', { name: guard.name }), t('guards.suspendConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('guards.suspend'),
        style: 'destructive',
        onPress: () => {
          setGuardActive(getDatabase(), guard.id, false);
          setOpenRow(null);
        },
      },
    ]);

  const retry = (conflict: PinConflict) => {
    if (conflict.kind === 'create' || conflict.user === null) {
      setSheet({ kind: 'create', conflict: conflict.call_id });
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
        {data.guards.map((guard) => (
          <GuardRow
            key={guard.id}
            guard={guard}
            line={guardLine(guard, openedAt, data.site.timezone)}
            open={openRow === guard.id}
            onToggle={() => {
              setOpenRow(openRow === guard.id ? null : guard.id);
              if (reveal?.kind === 'change') setReveal(null);
            }}
            onActivate={() => setGuardActive(getDatabase(), guard.id, true)}
          >
            {inlineReveal(guard.id) ?? (
              <View style={{ gap: space.s }}>
                <Button
                  variant="secondary"
                  label={busy === 'generating' ? t('guards.generating') : t('guards.newPin')}
                  disabled={busy !== null}
                  onPress={() => changeOf(guard, false)}
                />
                <Button variant="dangerText" label={t('guards.suspend')} onPress={() => suspend(guard)} />
              </View>
            )}
          </GuardRow>
        ))}

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
          <Button variant="secondary" label={t('guards.attach')} onPress={() => setSheet({ kind: 'attach' })} />
        )}
        <Button icon="plus" label={t('guards.newGuard')} onPress={() => setSheet({ kind: 'create', conflict: null })} />
      </ScrollView>

      <Modal
        visible={sheet !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={cancelReveal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
          {sheet !== null && (
            <SheetFrame onClose={cancelReveal}>
              {reveal !== null && reveal.kind !== 'change' ? (
                <PinPanel
                  reveal={reveal}
                  busy={busy}
                  onRegenerate={() => regenerate(reveal)}
                  onDone={() => void save(reveal)}
                  onCancel={cancelReveal}
                />
              ) : sheet.kind === 'create' ? (
                <NewGuardName
                  busy={busy !== null}
                  onNext={(name) => void showNewPin(null, (pin) => setReveal({ kind: 'create', name, pin, conflict: sheet.conflict }))}
                  onCancel={cancelReveal}
                />
              ) : (
                <AttachPick
                  guards={data.attachable}
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
            </SheetFrame>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  const { color, typography, space } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.label, { color: color.text2, paddingHorizontal: space.xs, paddingTop: space.s }]}>
      {text}
    </Text>
  );
}

function Avatar({ name, dimmed }: { name: string; dimmed: boolean }) {
  const { color, typography, size, radius, press } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.centre,
        { width: size.avatar, height: size.avatar, borderRadius: radius.round, backgroundColor: color.runBg },
        dimmed && { opacity: press.disabledOpacity },
      ]}
    >
      <Text style={[typography.monogram, { color: color.run }]}>{monogram(name)}</Text>
    </View>
  );
}

/**
 * A guard (S9): monogram, name, line. An active one opens to its actions (or its new PIN); a suspended one is dimmed,
 * with the switch that lets them in again.
 */
function GuardRow({
  guard,
  line,
  open,
  onToggle,
  onActivate,
  children,
}: {
  guard: SiteGuard;
  line: string;
  open: boolean;
  onToggle: () => void;
  onActivate: () => void;
  children: ReactNode;
}) {
  const { color, typography, space, size, radius, border, press, iconSize } = useTheme();
  const head = (
    <>
      <Avatar name={guard.name} dimmed={!guard.active} />
      <View style={[styles.grow, !guard.active && { opacity: press.disabledOpacity }]}>
        <Text style={[typography.body, { color: color.text }]}>{guard.name}</Text>
        <Text style={[typography.small, tabular, { color: color.text2 }]}>{line}</Text>
      </View>
    </>
  );
  return (
    <View
      style={{
        borderRadius: radius.item,
        backgroundColor: color.card,
        borderWidth: border.thin,
        borderColor: open ? color.accent : color.cardBorder,
        overflow: 'hidden',
      }}
    >
      {guard.active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}
        >
          {head}
          <Icon name="chevronDown" size={iconSize.banner} color={color.text2} />
        </Pressable>
      ) : (
        <View style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}>
          {head}
          <Switch value={false} onValueChange={onActivate} accessibilityLabel={t('guards.activeSwitch', { name: guard.name })} />
        </View>
      )}
      {guard.active && open && <View style={{ paddingHorizontal: space.m, paddingBottom: space.m }}>{children}</View>}
    </View>
  );
}

/** "Saját PIN-kód" (S9): the supervisor's own, with "Módosítás". */
function OwnPinRow({ line, busy, onChange, children }: { line: string; busy: boolean; onChange: () => void; children: ReactNode }) {
  const { color, typography, space, size, iconSize } = useTheme();
  return (
    <Card>
      <View style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}>
        <Icon name="shield" size={iconSize.field} color={color.run} />
        <View style={styles.grow}>
          <Text style={[typography.body, { color: color.text }]}>{t('guards.ownPin')}</Text>
          <Text style={[typography.small, { color: color.text2 }]}>{line}</Text>
        </View>
        {children === null && <Button variant="secondary" label={t('guards.change')} disabled={busy} onPress={onChange} />}
      </View>
      {children !== null && <View style={{ paddingHorizontal: space.m, paddingBottom: space.m }}>{children}</View>}
    </Card>
  );
}

/** The new PIN, shown once (S9): "Új PIN-kód – csak most látható", the six digits, whom to tell; "Újat generál", "Kész". */
function PinPanel({
  reveal,
  busy,
  onRegenerate,
  onDone,
  onCancel,
}: {
  reveal: Reveal;
  busy: 'generating' | 'saving' | null;
  onRegenerate: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { color, typography, space, radius } = useTheme();
  const hint =
    reveal.kind === 'create'
      ? t('guards.handOverNew')
      : reveal.kind === 'attach'
        ? t('guards.handOverAttach')
        : reveal.own
          ? t('guards.ownHint')
          : t('guards.handOver');
  const name = reveal.kind === 'create' ? reveal.name : reveal.user.name;
  return (
    <View style={{ gap: space.m }}>
      <View
        accessible
        accessibilityLabel={`${t('guards.pinFor', { name })}: ${[...reveal.pin].join(' ')}`}
        style={[styles.centre, { gap: space.xs, padding: space.l, borderRadius: radius.item, backgroundColor: color.runBg }]}
      >
        <Text style={[typography.label, { color: color.run }]}>{t('guards.newPinOnce')}</Text>
        <Text style={[typography.pinReveal, tabular, { color: color.text }]}>{formatPin(reveal.pin)}</Text>
        <Text style={[typography.small, { color: color.text2, textAlign: 'center' }]}>{hint}</Text>
      </View>
      <View style={[styles.row, { gap: space.s }]}>
        <Button
          variant="secondary"
          label={busy === 'generating' ? t('guards.generating') : t('guards.regenerate')}
          disabled={busy !== null}
          onPress={onRegenerate}
          style={styles.grow}
        />
        <Button
          label={busy === 'saving' ? t('guards.saving') : t('guards.done')}
          disabled={busy !== null}
          onPress={onDone}
          style={styles.grow}
        />
      </View>
      <Button variant="dangerText" label={t('common.cancel')} disabled={busy !== null} onPress={onCancel} />
    </View>
  );
}

function ConflictBanner({ conflict, onRetry, onDismiss }: { conflict: PinConflict; onRetry: () => void; onDismiss: () => void }) {
  const { space } = useTheme();
  const { title, text } = conflictText(conflict);
  return (
    <View style={{ gap: space.s }}>
      <InfoBanner variant="warn" title={title} text={text} />
      <View style={[styles.row, { gap: space.s }]}>
        <Button
          variant="secondary"
          label={conflict.kind === 'create' ? t('guards.newGuard') : t('guards.conflict.retry')}
          onPress={onRetry}
          style={styles.grow}
        />
        <Button variant="secondary" label={t('guards.conflict.dismiss')} onPress={onDismiss} style={styles.grow} />
      </View>
    </View>
  );
}

function SheetFrame({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { color, space, radius } = useTheme();
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space.m }}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

function SheetTitle({ text }: { text: string }) {
  const { color, typography } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
      {text}
    </Text>
  );
}

/** "Új őr": the name first; the PIN comes with "Tovább". */
function NewGuardName({ busy, onNext, onCancel }: { busy: boolean; onNext: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [missing, setMissing] = useState(false);
  const next = () => {
    const valid = guardName(name);
    if (valid === null) {
      setMissing(true);
      return;
    }
    onNext(valid);
  };
  return (
    <>
      <SheetTitle text={t('guards.newGuard')} />
      <TextField
        label={t('guards.newGuardName')}
        requirement="required"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setMissing(false);
        }}
        error={missing ? t('guards.nameMissing') : undefined}
        maxLength={GUARD_NAME_MAX}
        autoCapitalize="words"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={next}
      />
      <Button label={busy ? t('guards.generating') : t('guards.next')} disabled={busy} onPress={next} />
      <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
    </>
  );
}

/** "Meglévő őr hozzáadása": a guard of the supervisor's other sites. */
function AttachPick({
  guards,
  busy,
  onPick,
  onCancel,
}: {
  guards: readonly Person[];
  busy: boolean;
  onPick: (guard: Person) => void;
  onCancel: () => void;
}) {
  const { color, typography, space, size } = useTheme();
  return (
    <>
      <SheetTitle text={t('guards.attachTitle')} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('guards.attachHint')}</Text>
      <Card divided>
        {guards.map((guard) => (
          <Pressable
            key={guard.id}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onPick(guard)}
            style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}
          >
            <Avatar name={guard.name} dimmed={false} />
            <Text style={[typography.body, styles.grow, { color: color.text }]}>{guard.name}</Text>
          </Pressable>
        ))}
      </Card>
      <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  sheet: { maxHeight: '92%' },
});
