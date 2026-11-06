// The new PIN of the guards screen (S9), shown once: "Kész" saves it, until then nothing has changed.
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { formatPin } from '@/domain/pin-generate';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

export interface Person {
  id: string;
  name: string;
}

/** The login of a new supervisor, for their own phone. */
export interface SupervisorLogin {
  email: string;
  password: string;
}

/** A new PIN on the screen, not saved yet. */
export type Reveal =
  | { kind: 'change'; user: Person; own: boolean; pin: string; conflict: string | null }
  | { kind: 'create'; role: 'guard'; name: string; pin: string; conflict: string | null }
  | { kind: 'create'; role: 'supervisor'; name: string; login: SupervisorLogin; pin: string; conflict: string | null }
  | { kind: 'attach'; user: Person; pin: string; conflict: string | null };

function hintOf(reveal: Reveal): string {
  switch (reveal.kind) {
    case 'create':
      return reveal.role === 'supervisor' ? t('guards.handOverNewSupervisor') : t('guards.handOverNew');
    case 'attach':
      return t('guards.handOverAttach');
    case 'change':
      return reveal.own ? t('guards.ownHint') : t('guards.handOver');
  }
}

/** "Új PIN-kód – csak most látható", the six digits, whom to tell; "Újat generál", "Kész". */
export function PinPanel({
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
        <Text style={[typography.small, { color: color.text2, textAlign: 'center' }]}>{hintOf(reveal)}</Text>
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
