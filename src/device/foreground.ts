// The app in the foreground, for the runtimes that work only then (the scheduler, the sync, the alarms).
import { AppState, type AppStateStatus } from 'react-native';

/** Calls onReturn each time the app comes back to the foreground; returns the function that stops it. */
export function onForeground(onReturn: () => void): () => void {
  return followForeground(onReturn, () => {});
}

/** As onForeground, and a task every intervalMs while the app is in the foreground. */
export function whileInForeground(task: () => void, intervalMs: number, onReturn: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    interval ??= setInterval(task, intervalMs);
  };
  const stopInterval = () => {
    if (interval !== null) clearInterval(interval);
    interval = null;
  };

  if (AppState.currentState === 'active') start();
  const stop = followForeground(() => {
    onReturn();
    start();
  }, stopInterval);
  return () => {
    stopInterval();
    stop();
  };
}

function followForeground(onReturn: () => void, onLeave: () => void): () => void {
  let active = AppState.currentState === 'active';
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && !active) onReturn();
    else if (state !== 'active') onLeave();
    active = state === 'active';
  });
  return () => subscription.remove();
}
