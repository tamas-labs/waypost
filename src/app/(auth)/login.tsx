import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createApiClient } from '@/api/client';
import { apiBaseUrl } from '@/api/config';
import { checkLoginForm, loginError, type LoginError, type LoginField } from '@/auth/login-error';
import { signInSupervisor } from '@/account/supervisor';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { InfoBanner } from '@/components/info-banner';
import { SyncStatusIndicator } from '@/components/sync-status-indicator';
import { TextField } from '@/components/text-field';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';

/**
 * The API address, read again whenever the screen comes back: in a development build the developer API address screen
 * can set it meanwhile.
 */
function useApiBaseUrl(): string | null {
  const [baseUrl, setBaseUrl] = useState(() => apiBaseUrl(getDatabase()));
  useFocusEffect(useCallback(() => setBaseUrl(apiBaseUrl(getDatabase())), []));
  return baseUrl;
}

// Supervisor login (S1, B-Login) on a phone that is not enrolled: e-mail address and password, POST /auth/login, and
// the phone becomes the supervisor's own (signInSupervisor); the navigation follows the session to the site list.
// It needs the network; on the site phone the supervisor logs in with their PIN, so there is no way back to a PIN login.
export default function LoginScreen() {
  const { color, typography, space, radius, size, iconSize } = useTheme();
  const insets = useSafeAreaInsets();
  const replaced = useSyncStatus((state) => state.replaced);
  const offline = useSyncStatus((state) => state.online === false);
  const baseUrl = useApiBaseUrl();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [forgotShown, setForgotShown] = useState(false);
  const passwordInput = useRef<TextInputInstance>(null);

  const canLogIn = !busy && !offline && baseUrl !== null;

  const change = (field: LoginField, setValue: (value: string) => void) => (value: string) => {
    setValue(value);
    // The field's message goes with the change; the form's stays until the next attempt.
    setError((current) =>
      current === null || current.fields[field] === undefined ? current : { ...current, fields: { ...current.fields, [field]: undefined } },
    );
  };

  const submit = async () => {
    if (!canLogIn) return;
    const address = email.trim();
    const invalid = checkLoginForm(address, password);
    setError(invalid);
    setForgotShown(false);
    if (invalid !== null) return;
    setBusy(true);
    try {
      await signInSupervisor(getDatabase(), createApiClient({ baseUrl }), { email: address, password });
      // The screen closes: the session is the supervisor's phone now.
    } catch (e) {
      setError(loginError(e));
      setBusy(false);
    }
  };

  return (
    // As the Expo guide says: padding on iOS; on Android the view alone keeps the field above the keyboard.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScrollView
        style={styles.grow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xxl, paddingHorizontal: space.xxl, gap: space.xxl },
        ]}
      >
        {/* The chip sizes itself; this row centres it. */}
        <View style={styles.centre}>
          <SyncStatusIndicator />
        </View>

        <View style={[styles.centre, { gap: space.m, paddingTop: space.m }]}>
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[
              styles.centre,
              styles.logo,
              { width: size.logoTile, height: size.logoTile, borderRadius: radius.card, backgroundColor: color.accent },
            ]}
          >
            <Icon name="shieldCheck" size={iconSize.logo} color={color.onAccent} />
          </View>
          <Text style={[typography.title1, styles.text, { color: color.text }]} accessibilityRole="header">
            {t('supervisor.loginTitle')}
          </Text>
          <Text style={[typography.bodyRegular, styles.text, { color: color.text2 }]}>{t('supervisor.loginSubtitle')}</Text>
        </View>

        {replaced && <InfoBanner variant="warn" text={t('sync.replaced')} />}
        {offline && <InfoBanner variant="offline" icon="cloudOff" text={t('supervisor.loginOffline')} />}
        {baseUrl === null && <InfoBanner variant="error" text={t('supervisor.loginNoServer')} />}

        <Card>
          <TextField
            label={t('supervisor.email')}
            onCard
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
            onCard
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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: forgotShown }}
            onPress={() => setForgotShown((shown) => !shown)}
            style={[styles.centre, { minHeight: size.touchMin, paddingHorizontal: space.l }]}
          >
            <Text style={[typography.buttonSm, { color: color.accent }]}>{t('supervisor.forgot')}</Text>
          </Pressable>
          {forgotShown && <InfoBanner variant="info" text={t('supervisor.forgotHelp')} />}
        </Card>

        {error?.message != null && (
          <View accessibilityLiveRegion="polite" accessibilityRole="alert">
            <InfoBanner variant="error" text={error.message} />
          </View>
        )}

        <View style={[styles.bottom, { gap: space.m }]}>
          <Text style={[typography.banner, styles.text, { color: color.text2 }]}>{t('supervisor.firstLoginNote')}</Text>
          <Button label={busy ? t('supervisor.loggingIn') : t('supervisor.login')} disabled={!canLogIn} onPress={() => void submit()} />
          {__DEV__ && <Button label={t('dev.title')} variant="secondary" onPress={() => router.push('/dev')} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  content: { flexGrow: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  logo: { alignSelf: 'center' },
  text: { textAlign: 'center' },
  // The actions sit low, near the thumb, on a tall screen.
  bottom: { marginTop: 'auto' },
});
