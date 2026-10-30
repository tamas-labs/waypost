import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-provider';

import { Icon, type IconName } from './icon';

export type ResultTone = 'ok' | 'miss' | 'warn';

const TONES = {
  ok: { fg: 'ok', bg: 'okBg' },
  miss: { fg: 'miss', bg: 'missBg' },
  warn: { fg: 'warn', bg: 'warnBg' },
} as const;

export interface ResultScreenProps {
  tone: ResultTone;
  icon: IconName;
  /** In the tone's colour above the title: "Leolvasva · 22:14 · NFC", "Nem rögzítettük". */
  statusLine: string;
  /** The point's name or the result: "Tetőfeljáró", "Ismeretlen címke". */
  title: string;
  body?: string;
  /** The top row: round name and sync indicator. */
  header?: ReactNode;
  /** Under the texts: progress card, instruction, the read ID, the order comparison. */
  children?: ReactNode;
  /** The buttons at the bottom, the main one first. */
  actions: ReactNode;
}

/**
 * Full-screen scan result (DESIGN_HANDOFF 5.17): two concentric circles in the tone's colours with the icon, the status
 * line, the title, then the content and the buttons. Appears with fade + scale 0.96 → 1 in 200 ms (DESIGN_HANDOFF 7).
 */
export function ResultScreen({ tone, icon, statusLine, title, body, header, children, actions }: ResultScreenProps) {
  const { color, typography, size, space, iconSize, iconStroke, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { fg, bg } = TONES[tone];
  const entering = new Keyframe({
    0: { opacity: 0, transform: [{ scale: motion.resultScaleFrom }] },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  }).duration(motion.resultMs);
  return (
    <Animated.View
      entering={entering}
      style={[
        styles.screen,
        { backgroundColor: color.bg, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l, paddingHorizontal: space.xl, gap: space.l },
      ]}
    >
      {header}
      {/* A long instruction or a large font scrolls, and the buttons stay. */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.center, { gap: space.xl }]}>
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.ring, { width: size.resultRingOuter, height: size.resultRingOuter, borderRadius: size.resultRingOuter / 2, backgroundColor: color[bg] }]}
        >
          <View style={[styles.ring, { width: size.resultRingInner, height: size.resultRingInner, borderRadius: size.resultRingInner / 2, backgroundColor: color[fg] }]}>
            <Icon name={icon} size={iconSize.result} color={color.bg} strokeWidth={iconStroke.bold} />
          </View>
        </View>
        <View style={[styles.texts, { gap: space.s }]}>
          <Text style={[typography.resultLine, styles.text, { color: color[fg] }]}>{statusLine}</Text>
          <Text accessibilityRole="header" style={[typography.result, styles.text, { color: color.text }]}>
            {title}
          </Text>
          {body !== undefined && <Text style={[typography.resultBody, styles.text, { color: color.text2 }]}>{body}</Text>}
        </View>
        {children}
      </ScrollView>
      <View style={{ gap: space.m }}>{actions}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'stretch', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  texts: { alignItems: 'center' },
  text: { textAlign: 'center', fontVariant: ['tabular-nums'] },
});
