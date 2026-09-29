import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

/**
 * Keep the screen on while the QR is displayed. Unlike `useKeepAwake`, failures are ignored:
 * browsers may refuse or delay the wake lock, and deactivating before it activated throws.
 */
export function useScreenAwake(tag = 'kavriel-qr') {
  useEffect(() => {
    let activated = false;
    activateKeepAwakeAsync(tag)
      .then(() => {
        activated = true;
      })
      .catch(() => undefined);
    return () => {
      if (activated) deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [tag]);
}
