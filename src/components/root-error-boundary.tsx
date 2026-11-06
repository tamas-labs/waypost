import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { logError } from '@/diagnostics/error-log';
import { ThemeProvider, useTheme } from '@/theme/theme-provider';

import { StartupError } from './startup-error';

/**
 * The root layout's error boundary (expo-router): a screen that throws while rendering is logged (audit WP-APP-008)
 * and shown with a retry, instead of a blank app. It is outside the root layout, so the theme follows the system.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => logError('render', error), [error]);
  return (
    <ThemeProvider initialPreference="system">
      <ThemedStatusBar />
      <StartupError error={error} onRetry={() => void retry()} heading="startup.crashed" />
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const { name } = useTheme();
  return <StatusBar style={name === 'dark' ? 'light' : 'dark'} />;
}
