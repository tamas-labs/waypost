import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { InfoBanner } from '@/components/info-banner';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { showToast } from '@/components/toast';
import { getDatabase } from '@/db/open';
import { t } from '@/i18n';
import { checkNewSite, createSite, SITE_TEXT_MAX, type NewSite, type NewSiteErrors } from '@/supervisor/sites';
import { useSyncStatus } from '@/sync/status';
import { useTheme } from '@/theme/theme-provider';

// New site (S2 "Új telephely"; the design has no screen for it): name and address. It is saved at once on the phone and
// sent through the outbox, so it works offline too; the time zone and the no-data alert get the server's defaults.
export default function NewSiteScreen() {
  const { color, space } = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useSyncStatus((state) => state.online === false);
  const [site, setSite] = useState<NewSite>({ name: '', address: '' });
  const [errors, setErrors] = useState<NewSiteErrors | null>(null);

  const save = () => {
    const invalid = checkNewSite(site);
    setErrors(invalid);
    if (invalid !== null) return;
    try {
      createSite(getDatabase(), site);
    } catch (error) {
      showToast(t('supervisor.saveFailed', { message: error instanceof Error ? error.message : String(error) }), 'warn');
      return;
    }
    showToast(t('supervisor.siteCreated', { name: site.name.trim() }));
    router.back();
  };

  return (
    // As the Expo guide says: padding on iOS; on Android the view alone keeps the field above the keyboard.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.grow, { backgroundColor: color.bg }]}>
      <ScreenHeader title={t('supervisor.newSite')} onBack={() => router.back()} />
      <ScrollView style={styles.grow} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.l, gap: space.l }}>
        {offline && <InfoBanner variant="offline" icon="cloudOff" text={t('supervisor.siteOfflineNote')} />}
        <TextField
          label={t('supervisor.siteName')}
          requirement="required"
          value={site.name}
          onChangeText={(name) => {
            setSite((current) => ({ ...current, name }));
            setErrors(null);
          }}
          error={errors?.name === 'missing' ? t('supervisor.siteNameMissing') : undefined}
          maxLength={SITE_TEXT_MAX}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <TextField
          label={t('supervisor.siteAddress')}
          requirement="optional"
          value={site.address}
          onChangeText={(address) => setSite((current) => ({ ...current, address }))}
          maxLength={SITE_TEXT_MAX}
          autoComplete="street-address"
          textContentType="fullStreetAddress"
          returnKeyType="done"
          onSubmitEditing={save}
        />
      </ScrollView>
      <View style={{ paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: insets.bottom + space.l }}>
        <Button label={t('common.save')} onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
});
