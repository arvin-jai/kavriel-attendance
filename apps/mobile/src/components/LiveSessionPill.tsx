import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { sessionsApi } from '@/api/endpoints';
import { copy } from '@/copy';
import { colors, radius, spacing } from '@/theme';

import { AppText } from './ui';

/**
 * Shown above the teacher's tab bar on every tab while a session is running, so leaving the QR
 * screen never loses the class. Tap to go back to the QR.
 */
export function LiveSessionPill() {
  // Same key as the dashboard, so both share one cache entry and one poll.
  const active = useQuery({
    queryKey: ['sessions', 'ACTIVE'],
    queryFn: () => sessionsApi.list({ status: 'ACTIVE', limit: 10 }),
    refetchInterval: 15_000,
  });
  const live = active.data?.items[0];
  if (!live) return null;

  const inCount = live.counts.PRESENT + live.counts.LATE;
  const more = (active.data?.items.length ?? 1) - 1;
  const label = copy.livePill(live.class.subject.subjectName, inCount, live.enrolledCount);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/teacher/session/[id]/qr', params: { id: live.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Show QR code.`}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.dot} />
      <View style={{ flex: 1 }}>
        <AppText style={styles.text} numberOfLines={1}>
          {label}
        </AppText>
        {more > 0 ? <AppText style={styles.sub}>{copy.livePillMore(more)}</AppText> : null}
      </View>
      <Ionicons name="qr-code-outline" size={22} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.onSky,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#5FD48A' },
  text: { color: colors.white, fontWeight: '700' },
  sub: { color: colors.sky, fontSize: 13 },
});
