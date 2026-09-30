import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, spacing } from '@/theme';

import { AppText, Button } from './ui';

/** Everything but the greeting line, so a screen can build it conditionally. */
export type NowProps = Omit<Parameters<typeof NowCard>[0], 'greeting' | 'date'>;

/**
 * The one card that leads a dashboard: what is happening now (or next) and the one button for it.
 * Text is `onSky` on the sky-blue card. `time` is a clock string such as "7:30 AM".
 */
export function NowCard({
  greeting,
  date,
  label,
  time,
  title,
  meta,
  message,
  action,
  extra,
}: {
  greeting: string;
  date: string;
  /** Short status chip, e.g. "Up next", "Live now", "Open now". */
  label?: string;
  time?: string;
  title?: string;
  meta?: string;
  /** Shown instead of the details when nothing is scheduled. */
  message?: string;
  action: {
    title: string;
    icon?: ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    loading?: boolean;
  };
  extra?: ReactNode;
}) {
  const [clock, suffix] = time ? time.split(' ') : [];

  return (
    <View style={styles.card}>
      <View>
        <AppText variant="title" style={styles.ink}>
          {greeting}
        </AppText>
        <AppText variant="small" style={styles.ink}>
          {date}
        </AppText>
      </View>

      {label ? (
        <View style={styles.chip} accessibilityRole="text">
          <AppText style={styles.chipText}>{label}</AppText>
        </View>
      ) : null}

      {clock ? (
        <View
          style={styles.timeRow}
          accessible
          accessibilityLabel={time}
          importantForAccessibility="yes"
        >
          <AppText style={styles.time}>{clock}</AppText>
          {suffix ? (
            <AppText style={[styles.ink, { fontSize: font.subtitle }]}>{suffix}</AppText>
          ) : null}
        </View>
      ) : null}

      {title ? (
        <View style={{ gap: 2 }}>
          <AppText variant="subtitle" style={styles.ink}>
            {title}
          </AppText>
          {meta ? <AppText style={styles.ink}>{meta}</AppText> : null}
        </View>
      ) : null}

      {message ? <AppText style={styles.ink}>{message}</AppText> : null}
      {extra}

      <Button
        title={action.title}
        icon={action.icon}
        loading={action.loading}
        onPress={action.onPress}
        size="lg"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.sky,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  ink: { color: colors.onSky },
  chip: {
    alignSelf: 'flex-start',
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.onSky,
  },
  chipText: { color: colors.white, fontSize: font.label, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  time: { color: colors.onSky, fontSize: font.time, lineHeight: font.time + 6, fontWeight: '700' },
});
