import { usePreventRemove } from 'expo-router';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { t } from '@/i18n';

/**
 * Leaving an editing screen with unsaved changes asks first ("Elveted a módosításokat?"); "Elvetés" leaves. Only one
 * question is open at a time: on Android a back press while it was open asked again, the questions piled up, and
 * leaving the route editing after a drag crashed the app (Fabric: "The specified child already has a parent").
 * The screen's own unmount cleans up what the editing held (the draft photos), so nothing is reset before leaving.
 */
export function useConfirmLeave(changed: boolean): void {
  const asking = useRef(false);
  usePreventRemove(changed, ({ repeat }) => {
    if (asking.current) return;
    asking.current = true;
    const done = () => {
      asking.current = false;
    };
    Alert.alert(
      t('routeEdit.leaveTitle'),
      t('routeEdit.leaveConfirm'),
      [
        { text: t('routeEdit.leaveKeep'), style: 'cancel', onPress: done },
        {
          text: t('routeEdit.leaveDiscard'),
          style: 'destructive',
          onPress: () => {
            done();
            repeat();
          },
        },
      ],
      { cancelable: true, onDismiss: done },
    );
  });
}
