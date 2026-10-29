import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

export interface CardProps {
  children: ReactNode;
  /** A grouped list: a 1 dp line between the children, which then lay out their own padding. */
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Surface with radius 24 and the card border (DESIGN_HANDOFF 5.12). */
export function Card({ children, divided = false, style }: CardProps) {
  const { color, radius, space, border } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: color.surface, borderColor: color.cardBorder, borderWidth: border.thin, borderRadius: radius.card },
        !divided && { padding: space.l, gap: space.m },
        style,
      ]}
    >
      {divided
        ? items.map((item, index) => (
            <Fragment key={item.key ?? index}>
              {index > 0 && <View style={{ height: border.thin, backgroundColor: color.line }} />}
              {item}
            </Fragment>
          ))
        : children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
});
