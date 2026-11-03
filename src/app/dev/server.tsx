import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';

import { apiBaseUrl } from '@/api/config';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { deleteKv, getKv, setKv } from '@/db/kv';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

/** The base URL as the API client takes it: http(s)://host…, without the trailing slashes. */
function normalised(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/]+/.test(trimmed) ? trimmed : null;
}

// API address (development builds only; it replaces the developer enrollment of M3-06, Q7): the server the app talks to
// instead of EXPO_PUBLIC_WAYPOST_API_URL. The phone is enrolled on the site details screen (M5-09).
export default function DevServerScreen() {
  const { color, typography, space } = useTheme();
  const [current, setCurrent] = useState(() => apiBaseUrl(getDatabase()));
  const [url, setUrl] = useState(() => getKv(getDatabase(), 'dev.api_base_url') ?? current ?? '');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const save = () => {
    const value = normalised(url);
    if (value === null) {
      setMessage({ text: t('dev.server.invalidUrl'), error: true });
      return;
    }
    setKv(getDatabase(), 'dev.api_base_url', value);
    setUrl(value);
    setCurrent(apiBaseUrl(getDatabase()));
    setMessage({ text: t('dev.server.saved'), error: false });
  };

  const reset = () => {
    deleteKv(getDatabase(), 'dev.api_base_url');
    const value = apiBaseUrl(getDatabase());
    setCurrent(value);
    setUrl(value ?? '');
    setMessage(null);
  };

  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.l, gap: space.m }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('dev.server.title') }} />
      <Text style={[typography.bodyRegular, { color: color.text2 }]}>{t('dev.server.intro')}</Text>
      <Text style={[typography.body, { color: color.text }]}>
        {current === null ? t('dev.server.none') : t('dev.server.current', { url: current })}
      </Text>
      <TextField
        label={t('dev.server.apiUrl')}
        value={url}
        onChangeText={(value) => {
          setUrl(value);
          setMessage(null);
        }}
        placeholder={t('dev.server.apiUrlExample')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        onSubmitEditing={save}
        error={message?.error === true ? message.text : undefined}
      />
      {message?.error === false && <Text style={[typography.bodyRegular, { color: color.ok }]}>{message.text}</Text>}
      <Button label={t('dev.server.save')} onPress={save} />
      <Button label={t('dev.server.reset')} variant="secondary" onPress={reset} />
    </ScrollView>
  );
}
