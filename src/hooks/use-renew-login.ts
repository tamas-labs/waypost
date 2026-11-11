// The login again on a supervisor's own phone after a 401 (renewSupervisorLogin, audit WP-APP-016): the form's state and
// its submit, so that the sheet in src/components/renew-login.tsx only shows them (FR-022).
import { useState } from 'react';

import { OtherAccountError, renewSupervisorLogin } from '@/account/supervisor';
import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { checkLoginForm, loginError, type LoginError, type LoginField } from '@/auth/login-error';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { useSyncStatus } from '@/sync/status';

/** The server no longer takes this phone's supervisor token. */
export const useLoginExpired = () => useSyncStatus((state) => state.lastError?.kind === 'unauthenticated');

export interface RenewLoginForm {
  email: string;
  password: string;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  busy: boolean;
  offline: boolean;
  /** No API address on this phone. */
  noServer: boolean;
  canLogIn: boolean;
  error: LoginError | null;
  /** Logs in again; onDone after a login that worked. */
  submit: () => Promise<void>;
}

export function useRenewLogin(knownEmail: string | null, onDone: () => void): RenewLoginForm {
  const offline = useSyncStatus((state) => state.online === false);
  const [email, setEmailValue] = useState(knownEmail ?? '');
  const [password, setPasswordValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const baseUrl = apiBaseUrl(getDatabase());
  const canLogIn = !busy && !offline && baseUrl !== null;

  /** A changed field is no longer wrong. */
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
      onDone();
    } catch (e) {
      setError(
        e instanceof OtherAccountError
          ? { message: t('supervisor.renewOtherAccount', { name: e.accountName }), fields: {} }
          : loginError(e),
      );
      setBusy(false);
    }
  };

  return {
    email,
    password,
    setEmail: change('email', setEmailValue),
    setPassword: change('password', setPasswordValue),
    busy,
    offline,
    noServer: baseUrl === null,
    canLogIn,
    error,
    submit,
  };
}
