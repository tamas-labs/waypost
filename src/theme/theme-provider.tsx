import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { theme, type Theme, type ThemeName } from './tokens';

/** The user's choice in the settings: follow the system, or always dark / light. */
export type ThemePreference = 'system' | ThemeName;

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Dark is the default: light only if chosen, or if following a system that is in light mode. */
export function resolveThemeName(preference: ThemePreference, systemScheme: string | null | undefined): ThemeName {
  if (preference !== 'system') return preference;
  return systemScheme === 'light' ? 'light' : 'dark';
}

interface ThemeProviderProps {
  children: ReactNode;
  /** The stored choice (theme/preference.ts); read once, when the provider mounts. */
  initialPreference?: ThemePreference;
  /** Called with every new choice, to store it. */
  onPreferenceChange?: (preference: ThemePreference) => void;
}

export function ThemeProvider({ children, initialPreference = 'system', onPreferenceChange }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      onPreferenceChange?.(next);
    },
    [onPreferenceChange],
  );
  const current = theme(resolveThemeName(preference, systemScheme));

  // Android draws edge-to-edge: the root view's colour shows behind the system bars and during transitions.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(current.color.bg);
  }, [current.color.bg]);

  return <ThemeContext value={{ theme: current, preference, setPreference }}>{children}</ThemeContext>;
}

function useThemeContext(): ThemeContextValue {
  const value = use(ThemeContext);
  if (value === null) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return value;
}

/** The current theme: colours, typography, spacing, radii and sizes from tokens.ts. */
export function useTheme(): Theme {
  return useThemeContext().theme;
}

/** The theme preference and its setter (for the settings screen). */
export function useThemePreference(): Pick<ThemeContextValue, 'preference' | 'setPreference'> {
  const { preference, setPreference } = useThemeContext();
  return { preference, setPreference };
}
