// How a notification behaves while the app is in the foreground.
import { setNotificationHandler } from 'expo-notifications';

/** A round alarm is shown and sounds also while the app is open (by default the system would stay silent). */
export function showAlarmsInForeground(): void {
  setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}
