import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

import { copy } from '@/copy';

import { AppText } from './ui';

// Let TanStack Query pause/resume requests with connectivity.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

/** App-wide offline banner. Screens still show their own error states for failed requests. */
export function NetworkBanner() {
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)), []);

  if (!offline) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.text,
        paddingTop: insets.top + spacing.xs,
        paddingBottom: spacing.xs,
      }}
    >
      <AppText style={{ color: colors.white, textAlign: 'center', fontWeight: '600' }}>
        {copy.offline.banner}
      </AppText>
    </View>
  );
}
