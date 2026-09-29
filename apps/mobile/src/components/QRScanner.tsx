import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { AppText, Button } from './ui';

/**
 * Continuous QR scanner. Calls `onScan` once per distinct code (debounced by `cooldownMs`) and
 * ignores codes while `paused`, e.g. while a check-in request is in flight.
 */
export function QRScanner({
  onScan,
  paused = false,
  cooldownMs = 2000,
  height = 340,
}: {
  onScan: (data: string) => void;
  paused?: boolean;
  cooldownMs?: number;
  height?: number;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const lastRef = useRef<{ data: string; at: number }>({ data: '', at: 0 });

  if (!permission) return <View style={[styles.frame, { height }]} />;

  if (!permission.granted) {
    return (
      <View style={[styles.frame, styles.center, { height }]}>
        <AppText style={{ color: colors.white, textAlign: 'center' }}>
          Kavriel needs the camera to scan your teacher's attendance QR code.
        </AppText>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button
            title="Open settings"
            variant="secondary"
            onPress={() => Linking.openSettings()}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                const now = Date.now();
                const last = lastRef.current;
                if (data === last.data && now - last.at < cooldownMs) return;
                lastRef.current = { data, at: now };
                onScan(data);
              }
        }
      />
      <View pointerEvents="none" style={styles.reticleWrap}>
        <View style={[styles.reticle, paused && { borderColor: colors.textMuted }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.black },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  reticleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: '65%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.white,
    borderRadius: radius.lg,
  },
});
