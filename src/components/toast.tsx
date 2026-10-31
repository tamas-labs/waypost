import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '@/theme/theme-provider';

import { InfoBanner, type InfoBannerVariant } from './info-banner';

interface Toast {
  /** A new toast of the same text starts its time over. */
  id: number;
  text: string;
  variant: InfoBannerVariant;
}

const useToast = create<{ toast: Toast | null }>(() => ({ toast: null }));
let lastId = 0;

/** A short message over the screens, shown by the ToastHost for a few seconds; a new one replaces it. */
export function showToast(text: string, variant: InfoBannerVariant = 'success'): void {
  lastId += 1;
  useToast.setState({ toast: { id: lastId, text, variant } });
}

/** Lets touches through, so it blocks nothing while it is shown (DESIGN_HANDOFF 6, G11). */
export function ToastHost() {
  const { space, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast((state) => state.toast);
  const id = toast?.id ?? null;

  useEffect(() => {
    if (id === null) return undefined;
    const timer = setTimeout(() => useToast.setState({ toast: null }), motion.toastMs);
    return () => clearTimeout(timer);
  }, [id, motion]);

  if (toast === null) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + space.s, paddingHorizontal: space.l }]}>
      <Animated.View key={toast.id} entering={FadeIn.duration(motion.toastFadeMs)} exiting={FadeOut.duration(motion.toastFadeMs)} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <InfoBanner variant={toast.variant} text={toast.text} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0 },
});
