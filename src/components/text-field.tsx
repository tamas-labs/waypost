import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { useTheme } from '@/theme/theme-provider';

import { Icon } from './icon';

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry' | 'multiline' | 'placeholderTextColor'> {
  label: string;
  /** Marks the label: "· kötelező" in the error colour or "· nem kötelező" in the secondary text colour. */
  requirement?: 'required' | 'optional';
  /** A password: hidden, with an eye button that shows it. */
  secret?: boolean;
  /** Inside a card: the field fill instead of the surface (DESIGN_HANDOFF 3, colour rules). */
  onCard?: boolean;
  /** A message under the field, in the error colour. */
  error?: string;
  style?: StyleProp<ViewStyle>;
}

/** Labelled input (DESIGN_HANDOFF 5.13): 56 dp, radius 18; focused → 2 dp accent border. */
export function TextField(props: TextFieldProps) {
  return <Field {...props} multiline={false} />;
}

/** Multi-line TextField for notes: at least ~3 lines, growing with the text. */
export function TextArea(props: Omit<TextFieldProps, 'secret'>) {
  return <Field {...props} multiline />;
}

function Field({ label, requirement, secret = false, onCard = false, error, style, multiline, onFocus, onBlur, ...input }: TextFieldProps & { multiline: boolean }) {
  const { color, typography, radius, space, size, border, iconSize, fontFamily } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const requirementText = requirement === undefined ? null : t(requirement === 'required' ? 'common.required' : 'common.optional');
  // The border grows to 2 dp on focus; the padding gives the difference back so the text does not move.
  const borderWidth = focused ? border.thick : border.thin;
  const inset = border.thick - borderWidth;
  return (
    <View style={[{ gap: space.s }, style]}>
      <Text style={[typography.label, { color: color.text, paddingLeft: space.xs }]}>
        {label}
        {requirementText !== null && (
          <Text style={requirement === 'required' ? { color: color.miss } : { color: color.text2, fontFamily: fontFamily.semibold }}>{` · ${requirementText}`}</Text>
        )}
      </Text>
      <View
        style={[
          styles.box,
          {
            minHeight: multiline ? size.textArea : size.field,
            borderRadius: radius.item,
            borderWidth,
            borderColor: focused ? color.accent : color.cardBorder,
            backgroundColor: onCard ? color.field : color.surface,
            padding: inset,
          },
        ]}
      >
        <TextInput
          {...input}
          accessibilityLabel={requirementText === null ? label : `${label}, ${requirementText}`}
          multiline={multiline}
          secureTextEntry={secret && !revealed}
          placeholderTextColor={color.text2}
          selectionColor={color.accent}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            typography.bodyRegular,
            styles.input,
            { color: color.text, paddingHorizontal: space.l },
            multiline && [styles.multiline, { paddingVertical: space.m }],
          ]}
        />
        {secret && (
          <Pressable
            accessibilityRole="togglebutton"
            accessibilityLabel={t('supervisor.showPassword')}
            accessibilityState={{ checked: revealed }}
            onPress={() => setRevealed((shown) => !shown)}
            style={[styles.eye, { width: size.touchMin, minHeight: size.touchMin }]}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={iconSize.field} color={color.text2} />
          </Pressable>
        )}
      </View>
      {error !== undefined && <Text style={[typography.small, { color: color.miss, paddingLeft: space.xs }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'stretch' },
  input: { flex: 1 },
  multiline: { textAlignVertical: 'top' },
  eye: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
