import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { OtherAccountError, renewSupervisorLogin } from '@/account/supervisor';
import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { checkLoginForm, loginError, type LoginError, type LoginField } from '@/auth/login-error';
import { Button } from '@/components/button';
import { InfoBanner } from '@/components/info-banner';
import { Sheet, SheetModal } from '@/components/sheet';
import { TextField } from '@/components/text-field';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';

/**
 * On a supervisor's own phone whose token the server no longer takes (401): what it means, and a login again that
 * keeps the account's data and unsent actions (renewSupervisorLogin, audit WP-APP-016).
 */
export function RenewLogin({ email }: { email: string | null }) {
  const { space } = useTheme();
  const expired = useSyncStatus((state) => state.lastError?.kind === 'unauthenticated');
  const [open, setOpen] = useState(false);
  if (!expired && !open) return null;
  return (
    <View style={{ gap: space.s }}>
      <InfoBanner variant="error" title={t('supervisor.renewTitle')} text={t('supervisor.renewText')} />
      <Button label={t('supervisor.renewButton')} onPress={() => setOpen(true)} />
      <SheetModal visible={open} onClose={() => setOpen(false)}>
        {open && <RenewLoginSheet email={email} onClose={() => setOpen(false)} />}
      </SheetModal>
    </View>
  );
}

function RenewLoginSheet({ email: knownEmail, onClose }: { email: string | null; onClose: () => void }) {
  const offline = useSyncStatus((state) => state.online === false);
  const [email, setEmail] = useState(knownEmail ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const baseUrl = apiBaseUrl(getDatabase());
  const canLogIn = !busy && !offline && baseUrl !== null;

  const change = (field: LoginField, setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    setError((current) =>
      current === null || current.fields[field] === undefined ? current : { ...current, fields: { ...current.fields, [field]: undefined } },
    );
  };

  const submit = async () => {
    if (!canLogIn) return;
    const address = email.trim();
    const invalid = checkLoginForm(address, password);
    setError(invalid);
    if (invalid !== null) return;
    setBusy(true);
    try {
      await renewSupervisorLogin(getDatabase(), createApiClient({ baseUrl }), { email: address, password });
      onClose();
    } catch (e) {
      setError(
        e instanceof OtherAccountError
          ? { message: t('supervisor.renewOtherAccount', { name: e.accountName }), fields: {} }
          : loginError(e),
      );
      setBusy(false);
    }
  };

  return (
    <Sheet title={t('supervisor.renewTitle')} onClose={onClose} form gap="l">
      {offline && <InfoBanner variant="offline" icon="cloudOff" text={t('supervisor.loginOffline')} />}
      {baseUrl === null && <InfoBanner variant="error" text={t('supervisor.loginNoServer')} />}
      <TextField
        label={t('supervisor.email')}
        value={email}
        onChangeText={change('email', setEmail)}
        error={error?.fields.email}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordInput.current?.focus()}
      />
      <TextField
        ref={passwordInput}
        label={t('supervisor.password')}
        secret
        value={password}
        onChangeText={change('password', setPassword)}
        error={error?.fields.password}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      {error?.message != null && (
        <View accessibilityLiveRegion="polite" accessibilityRole="alert">
          <InfoBanner variant="error" text={error.message} />
        </View>
      )}
      <Button label={busy ? t('supervisor.loggingIn') : t('supervisor.login')} disabled={!canLogIn} onPress={() => void submit()} />
      <Button variant="secondary" label={t('common.cancel')} onPress={onClose} />
    </Sheet>
  );
}
