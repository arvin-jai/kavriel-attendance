import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './ui';

/**
 * Large, high-contrast attendance QR for classroom scanning. Encodes the raw signed token only
 * (no URL, no personal data). A null token shows a placeholder instead of a stale code.
 */
export function SessionQR({ token, size: fixed }: { token: string | null; size?: number }) {
  const { width, height } = useWindowDimensions();
  const size = fixed ?? Math.min(width * 0.78, height * 0.45, 420);

  return (
    <View
      style={{
        backgroundColor: colors.white,
        padding: spacing.lg,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        width: size + spacing.lg * 2,
        height: size + spacing.lg * 2,
      }}
      accessibilityLabel={token ? 'Attendance QR code' : 'QR code is refreshing'}
    >
      {token ? (
        <QRCode
          value={token}
          size={size}
          ecl="M"
          backgroundColor={colors.white}
          color={colors.black}
        />
      ) : (
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="muted">Reconnecting…</AppText>
        </View>
      )}
    </View>
  );
}
