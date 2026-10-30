// How a notification behaves while the app is in the foreground.
import { setNotificationHandler, type Notification } from 'expo-notifications';

let takenOver: (notification: Notification) => boolean = () => false;

/** Notifications for which the app rings itself on the alarm screen (G4): no banner, and no second sound. */
export function setForegroundTakeover(check: (notification: Notification) => boolean): void {
  takenOver = check;
}

/** A round alarm is shown and sounds also while the app is open (by default the system would stay silent). */
export function showAlarmsInForeground(): void {
  setNotificationHandler({
    handleNotification: async (notification) => {
      const show = !takenOver(notification);
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}
