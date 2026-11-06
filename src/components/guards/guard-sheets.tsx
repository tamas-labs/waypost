// The sheets of the guards screen (S9) before the PIN: a new guard's name, a new supervisor's name and login, whom of
// the other sites to assign here; and the banner of a refused PIN.
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { InfoBanner } from '@/components/info-banner';
import { SheetTitle } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { t } from '@/i18n';
import {
  EMAIL_MAX,
  GUARD_NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  guardName,
  supervisorEmail,
  validPassword,
  type PinConflict,
  type UserRole,
} from '@/supervisor/guards';
import { conflictText } from '@/supervisor/guards-view';
import { useTheme } from '@/theme/theme-provider';

import { Avatar } from './person-row';
import type { Person, SupervisorLogin } from './pin-panel';

/** "Új őr": the name first; the PIN comes with "Tovább". */
export function NewGuardName({ busy, onNext, onCancel }: { busy: boolean; onNext: (name: string) => void; onCancel: () => void }) {
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

/** "Új supervisor": the name, the e-mail address and the password of their own phone; the PIN comes with "Tovább". */
export function NewSupervisorForm({
  busy,
  onNext,
  onCancel,
}: {
  busy: boolean;
  onNext: (name: string, login: SupervisorLogin) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState<{ name: boolean; email: boolean; password: boolean }>({ name: false, email: false, password: false });
  const { color, typography } = useTheme();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const next = () => {
    const validName = guardName(name);
    const validEmail = supervisorEmail(email);
    const passwordOk = validPassword(password);
    setShown({ name: validName === null, email: validEmail === null, password: !passwordOk });
    if (validName === null || validEmail === null || !passwordOk) return;
    onNext(validName, { email: validEmail, password });
  };
  return (
    <>
      <SheetTitle text={t('guards.newSupervisor')} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('guards.newSupervisorHint')}</Text>
      <TextField
        label={t('guards.newSupervisorName')}
        requirement="required"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setShown((current) => ({ ...current, name: false }));
        }}
        error={shown.name ? t('guards.supervisorNameMissing') : undefined}
        maxLength={GUARD_NAME_MAX}
        autoCapitalize="words"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label={t('guards.email')}
        requirement="required"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setShown((current) => ({ ...current, email: false }));
        }}
        error={shown.email ? t('guards.emailInvalid') : undefined}
        maxLength={EMAIL_MAX}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('guards.password')}
        requirement="required"
        secret
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setShown((current) => ({ ...current, password: false }));
        }}
        error={shown.password ? t('guards.passwordShort', { min: PASSWORD_MIN }) : undefined}
        maxLength={PASSWORD_MAX}
        autoComplete="new-password"
        returnKeyType="next"
        onSubmitEditing={next}
      />
      <Button label={busy ? t('guards.generating') : t('guards.next')} disabled={busy} onPress={next} />
      <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
    </>
  );
}

/** "Meglévő őr hozzáadása": a guard or supervisor of the supervisor's other sites. */
export function AttachPick({
  people,
  busy,
  onPick,
  onCancel,
}: {
  people: readonly (Person & { role: UserRole })[];
  busy: boolean;
  onPick: (person: Person & { role: UserRole }) => void;
  onCancel: () => void;
}) {
  const { color, typography, space, size } = useTheme();
  const any = people.some((person) => person.role === 'supervisor');
  return (
    <>
      <SheetTitle text={any ? t('guards.attachTitleAny') : t('guards.attachTitle')} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{any ? t('guards.attachHintAny') : t('guards.attachHint')}</Text>
      <Card divided>
        {people.map((person) => (
          <Pressable
            key={person.id}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onPick(person)}
            style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}
          >
            <Avatar name={person.name} dimmed={false} />
            <View style={styles.grow}>
              <Text style={[typography.body, { color: color.text }]}>{person.name}</Text>
              {person.role === 'supervisor' && <Text style={[typography.small, { color: color.text2 }]}>{t('guards.roleSupervisor')}</Text>}
            </View>
          </Pressable>
        ))}
      </Card>
      <Button variant="secondary" label={t('common.cancel')} onPress={onCancel} />
    </>
  );
}

export function ConflictBanner({ conflict, onRetry, onDismiss }: { conflict: PinConflict; onRetry: () => void; onDismiss: () => void }) {
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

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
