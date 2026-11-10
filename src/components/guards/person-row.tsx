// The rows of the guards screen (S9): a guard or another supervisor of the site, and the supervisor's own PIN.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { monogram } from '@/components/account-button';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Switch } from '@/components/switch';
import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';
import { tabular } from '@/theme/tokens';

export function Avatar({ name, dimmed }: { name: string; dimmed: boolean }) {
  const { color, typography, size, radius, press } = useTheme();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.centre,
        { width: size.avatar, height: size.avatar, borderRadius: radius.round, backgroundColor: color.runBg },
        dimmed && { opacity: press.disabledOpacity },
      ]}
    >
      <Text style={[typography.monogram, { color: color.run }]}>{monogram(name)}</Text>
    </View>
  );
}

/**
 * A guard or another supervisor (S9): monogram, name, line. An active one opens to its actions (or its new PIN); a
 * suspended one is dimmed, with the switch that lets them in again.
 */
export function PersonRow({
  person,
  line,
  open,
  onToggle,
  onActivate,
  children,
}: {
  person: { name: string; active: boolean };
  line: string;
  open: boolean;
  onToggle: () => void;
  onActivate: () => void;
  children: ReactNode;
}) {
  const { color, typography, space, size, radius, border, press, iconSize } = useTheme();
  const head = (
    <>
      <Avatar name={person.name} dimmed={!person.active} />
      <View style={[styles.grow, !person.active && { opacity: press.disabledOpacity }]}>
        <Text style={[typography.body, { color: color.text }]}>{person.name}</Text>
        <Text style={[typography.small, tabular, { color: color.text2 }]}>{line}</Text>
      </View>
    </>
  );
  return (
    <View
      style={{
        borderRadius: radius.item,
        backgroundColor: color.card,
        borderWidth: border.thin,
        borderColor: open ? color.accent : color.cardBorder,
        overflow: 'hidden',
      }}
    >
      {person.active ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={onToggle}
          style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}
        >
          {head}
          <Icon name="chevronDown" size={iconSize.banner} color={color.text2} />
        </Pressable>
      ) : (
        <View style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}>
          {head}
          <Switch value={false} onValueChange={onActivate} accessibilityLabel={t('guards.activeSwitch', { name: person.name })} />
        </View>
      )}
      {person.active && open && <View style={{ paddingHorizontal: space.m, paddingBottom: space.m }}>{children}</View>}
    </View>
  );
}

/** "Saját PIN-kód" (S9): the supervisor's own, with "Módosítás". */
export function OwnPinRow({ line, busy, onChange, children }: { line: string; busy: boolean; onChange: () => void; children: ReactNode }) {
  const { color, typography, space, size, iconSize } = useTheme();
  return (
    <Card>
      <View style={[styles.row, { minHeight: size.listItem, padding: space.m, gap: space.m }]}>
        <Icon name="shield" size={iconSize.field} color={color.run} />
        <View style={styles.grow}>
          <Text style={[typography.body, { color: color.text }]}>{t('guards.ownPin')}</Text>
          <Text style={[typography.small, { color: color.text2 }]}>{line}</Text>
        </View>
        {/* Narrow side padding: with the default the label took a third of a 360 dp row, and the name broke into four lines. */}
        {children === null && (
          <Button
            variant="secondary"
            label={t('guards.change')}
            disabled={busy}
            onPress={onChange}
            style={{ paddingHorizontal: space.m }}
          />
        )}
      </View>
      {children !== null && <View style={{ paddingHorizontal: space.m, paddingBottom: space.m }}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
