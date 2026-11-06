// The bottom sheet of the supervisor screens (DESIGN_HANDOFF 5): over a scrim that closes it, up to 92% of the screen,
// its content scrolling; with a form in it, it moves above the keyboard on iOS. SheetModal is the transparent modal
// it opens in.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

/** The modal of a sheet: transparent, fading, under the status and navigation bars; back closes it. */
export function SheetModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {children}
    </Modal>
  );
}

export function SheetTitle({ text }: { text: string }) {
  const { color, typography } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.title2, { color: color.text }]}>
      {text}
    </Text>
  );
}

export function Sheet({
  title,
  onClose,
  form = false,
  gap = 'm',
  children,
}: {
  /** Shown first; without it the content brings its own (a sheet of several steps). */
  title?: string;
  onClose: () => void;
  /** A sheet with text fields: it moves above the keyboard on iOS. */
  form?: boolean;
  gap?: 'm' | 'l';
  children: ReactNode;
}) {
  const { color, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const content = (
    <>
      <Pressable
        style={[styles.grow, { backgroundColor: color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
      />
      <View style={[styles.sheet, { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: space.l, paddingBottom: insets.bottom + space.l, gap: space[gap] }}
        >
          {title !== undefined && <SheetTitle text={title} />}
          {children}
        </ScrollView>
      </View>
    </>
  );
  return form ? (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.grow}>
      {content}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.grow}>{content}</View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  sheet: { maxHeight: '92%' },
});
