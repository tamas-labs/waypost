import type { Site } from '@waypost/schema';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiBaseUrl } from '@/api/config';
import { createApiClient, type ApiClient } from '@/api/client';
import { listSites, login } from '@/api/endpoints';
import { InvalidResponseError, isApiError, NetworkError } from '@/api/errors';
import { enrollmentRequest, enrollThisPhone } from '@/auth/enrollment';
import { setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

type Step = { name: 'login' } | { name: 'site'; api: ApiClient; token: string; sites: Site[] } | { name: 'done'; site: Site };

function errorText(error: unknown, baseUrl: string): string {
  if (error instanceof NetworkError) return t('dev.enroll.networkError', { url: baseUrl });
  if (error instanceof InvalidResponseError) return t('dev.enroll.invalidResponse', { details: [error.message, ...error.errors].join('\n') });
  if (isApiError(error)) return error.message;
  return t('dev.enroll.error', { message: error instanceof Error ? error.message : String(error) });
}

// Developer enrollment (M3-06, Q7): supervisor login + POST /devices/enroll, until the real flow of M5-09 exists.
export default function DevEnrollScreen() {
  const { color, typography, space, radius, size } = useTheme();
  const [baseUrl, setBaseUrl] = useState(() => apiBaseUrl(getDatabase()) ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>({ name: 'login' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e, baseUrl));
    } finally {
      setBusy(false);
    }
  }

  const logIn = () =>
    run(async () => {
      const url = baseUrl.trim();
      if (!/^https?:\/\/[^/]+/.test(url)) throw new Error(t('dev.enroll.invalidUrl'));
      const api = createApiClient({ baseUrl: url });
      setKv(getDatabase(), 'dev.api_base_url', api.baseUrl);
      const { token } = await login(api, { email: email.trim(), password, device_name: enrollmentRequest('').name });
      const { sites } = await listSites(api, token);
      setStep({ name: 'site', api, token, sites });
    });

  const enroll = (site: Site) =>
    run(async () => {
      if (step.name !== 'site') return;
      await enrollThisPhone(getDatabase(), step.api, step.token, site.id);
      setStep({ name: 'done', site });
    });

  const field = [
    typography.bodyRegular,
    styles.field,
    { backgroundColor: color.field, color: color.text, borderColor: color.line, borderRadius: radius.item, minHeight: size.touchMin, paddingHorizontal: space.m },
  ];
  const button = [styles.button, { backgroundColor: color.accent, borderRadius: radius.pill, minHeight: size.buttonSecondary, paddingHorizontal: space.l }];
  const item = [styles.item, { backgroundColor: color.surface, borderColor: color.cardBorder, borderRadius: radius.item, minHeight: size.listItem, paddingHorizontal: space.l }];

  return (
    <ScrollView style={{ backgroundColor: color.bg }} contentContainerStyle={{ padding: space.l, gap: space.m }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t('dev.enroll.title') }} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('dev.enroll.intro')}</Text>

      {step.name === 'login' && (
        <>
          <Text style={[typography.label, { color: color.text2 }]}>{t('dev.enroll.apiUrl')}</Text>
          <TextInput
            style={field}
            value={baseUrl}
            onChangeText={setBaseUrl}
            accessibilityLabel={t('dev.enroll.apiUrl')}
            placeholder={t('dev.enroll.apiUrlExample')}
            placeholderTextColor={color.text2}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={[typography.label, { color: color.text2 }]}>{t('supervisor.email')}</Text>
          <TextInput
            style={field}
            value={email}
            onChangeText={setEmail}
            accessibilityLabel={t('supervisor.email')}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" />
          <Text style={[typography.label, { color: color.text2 }]}>{t('supervisor.password')}</Text>
          <TextInput
            style={field}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel={t('supervisor.password')}
            secureTextEntry autoComplete="password" onSubmitEditing={logIn} />
          <Pressable style={button} onPress={logIn} disabled={busy || email === '' || password === ''} accessibilityRole="button">
            <Text style={[typography.buttonSm, { color: color.onAccent }]}>{t('supervisor.login')}</Text>
          </Pressable>
        </>
      )}

      {step.name === 'site' && (
        <>
          <Text style={[typography.title2, { color: color.text }]}>{step.sites.length > 0 ? t('dev.enroll.chooseSite') : t('dev.enroll.noSites')}</Text>
          {step.sites.map((site) => (
            <Pressable key={site.id} style={item} onPress={() => void enroll(site)} disabled={busy} accessibilityRole="button">
              <Text style={[typography.body, { color: color.text }]}>{site.name}</Text>
              {site.address !== null && <Text style={[typography.small, { color: color.text2 }]}>{site.address}</Text>}
            </Pressable>
          ))}
        </>
      )}

      {step.name === 'done' && (
        <>
          <Text style={[typography.title2, { color: color.ok }]}>{t('dev.enroll.done', { site: step.site.name })}</Text>
          <Pressable style={button} onPress={() => router.replace('/')} accessibilityRole="button">
            <Text style={[typography.buttonSm, { color: color.onAccent }]}>{t('common.done')}</Text>
          </Pressable>
        </>
      )}

      {busy && (
        <View style={[styles.row, { gap: space.s }]}>
          <ActivityIndicator color={color.accent} />
          <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('dev.enroll.working')}</Text>
        </View>
      )}
      {error !== null && <Text style={[typography.bodyRegular, { color: color.miss }]}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  field: { borderWidth: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  item: { borderWidth: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
