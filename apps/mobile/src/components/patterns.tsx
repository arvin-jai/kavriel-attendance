/**
 * Direction A patterns built on the base kit: grouped list rows, segmented control, day strip,
 * timeline, and the two small meters used on the live screens. No shadows, no gradients.
 */
import { Ionicons } from '@expo/vector-icons';
import { Children, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { copy } from '@/copy';
import { colors, radius, spacing } from '@/theme';

import { AppText } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ───────────── Lists ─────────────

/** One white card holding several rows with hairline dividers, instead of a card per item. */
export function ListGroup({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.group, style]}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? styles.divider : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** Rounded tile with a letter or initials. The only "image" a person or subject needs. */
export function InitialTile({ label, size = 44 }: { label: string; size?: number }) {
  const text = label
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View
      style={[styles.tile, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppText style={{ color: colors.onSky, fontWeight: '700', fontSize: size * 0.36 }}>
        {text}
      </AppText>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  right,
  onPress,
  tone = 'default',
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  leading?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'danger';
}) {
  const body = (
    <View style={styles.row}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={tone === 'danger' ? { color: colors.absentFg, fontWeight: '700' } : null}>
          {title}
        </AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
        {meta ? <AppText variant="small">{meta}</AppText> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { backgroundColor: colors.primaryContainer }}
    >
      {body}
    </Pressable>
  );
}

/** A row that does something (edit, archive, delete). Icon plus label, danger in red. */
export function ActionRow({
  icon,
  title,
  onPress,
  tone = 'default',
  busy = false,
}: {
  icon: IconName;
  title: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  busy?: boolean;
}) {
  return (
    <ListRow
      title={busy ? `${title}…` : title}
      tone={tone}
      onPress={busy ? undefined : onPress}
      leading={
        <Ionicons
          name={icon}
          size={22}
          color={tone === 'danger' ? colors.absentFg : colors.primaryDark}
        />
      }
    />
  );
}

/** One card with up to three figures side by side; tappable as a whole. */
export function InsightStrip({
  items,
  onPress,
}: {
  items: { value: string | number; label: string }[];
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.insight}>
      {items.map((item, i) => (
        <View key={item.label} style={[styles.figure, i > 0 && styles.figureDivider]}>
          <AppText style={styles.figureValue}>{item.value}</AppText>
          <AppText variant="small">{item.label}</AppText>
        </View>
      ))}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

// ───────────── Controls ─────────────

/** Two or three exclusive options in one track. Selected = white, bold, raised. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentOn]}
          >
            <AppText
              style={{
                color: active ? colors.onSky : colors.textMuted,
                fontWeight: active ? '700' : '400',
              }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Seven equal day buttons. `marked` days have something scheduled (shown as a dot). */
export function DayStrip<T extends string>({
  days,
  value,
  onChange,
}: {
  days: { value: T; label: string; marked?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.strip}>
      {days.map((d) => {
        const active = d.value === value;
        return (
          <Pressable
            key={d.value}
            onPress={() => onChange(d.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={d.marked ? `${d.label}, has classes` : d.label}
            style={[styles.day, active && styles.dayOn]}
          >
            <AppText
              style={{
                color: active ? colors.white : colors.text,
                fontWeight: active ? '700' : '400',
                fontSize: 14,
              }}
            >
              {d.label}
            </AppText>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: d.marked
                    ? active
                      ? colors.white
                      : colors.primary
                    : 'transparent',
                },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Time on the left, a dot on a line, content on the right. */
export function TimelineRow({
  time,
  last = false,
  current = false,
  children,
}: {
  time: string;
  last?: boolean;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.timeline}>
      <AppText variant="small" style={styles.time}>
        {time}
      </AppText>
      <View style={styles.rail}>
        <View style={[styles.node, current && { backgroundColor: colors.primary }]} />
        {!last ? <View style={styles.line} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: spacing.md }}>{children}</View>
    </View>
  );
}

// ───────────── Meters ─────────────

/** Stacked bar. The label reads the counts aloud, so the bar itself is decoration. */
export function SegmentedBar({
  parts,
}: {
  parts: { value: number; color: string; label: string }[];
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const summary = parts.map((p) => `${p.value} ${p.label}`).join(', ');
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={summary}
      style={styles.bar}
    >
      {total === 0 ? (
        <View style={{ flex: 1, backgroundColor: colors.border }} />
      ) : (
        parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <View key={p.label} style={{ flex: p.value / total, backgroundColor: p.color }} />
          ))
      )}
    </View>
  );
}

/** Countdown to the next QR code. The words carry the meaning; the bar is extra. */
export function TimerBar({
  secondsLeft,
  rotationSeconds,
  active = true,
}: {
  secondsLeft: number;
  rotationSeconds: number;
  active?: boolean;
}) {
  const pct = active
    ? Math.max(0, Math.min(1, secondsLeft / Math.max(1, rotationSeconds))) * 100
    : 0;
  return (
    <View style={styles.timerRow}>
      <AppText accessibilityLiveRegion="polite" style={{ fontWeight: '700' }}>
        {active ? copy.qr.newCodeIn(secondsLeft) : copy.qr.gettingCode}
      </AppText>
      <View style={styles.timerTrack}>
        <View style={[styles.timerFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  figure: { flex: 1, gap: 2 },
  figureDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
  },
  figureValue: { color: colors.primaryDark, fontSize: 26, lineHeight: 30, fontWeight: '700' },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tile: {
    borderRadius: radius.md,
    backgroundColor: colors.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  strip: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  dot: { width: 6, height: 6, borderRadius: 3 },
  timeline: { flexDirection: 'row', gap: spacing.sm },
  time: { width: 44, paddingTop: spacing.lg, color: colors.textMuted },
  rail: { alignItems: 'center', width: 14 },
  node: {
    width: 14,
    height: 14,
    marginTop: spacing.lg + 2,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  line: { flex: 1, width: 2, backgroundColor: colors.border },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  timerRow: { alignSelf: 'stretch', gap: spacing.sm },
  timerTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryContainer,
    overflow: 'hidden',
  },
  timerFill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
});

/**
 * Several days at once. Selected days get a check and a dark fill, and a "Selected:" line says
 * the choice in words, so it never rests on colour alone.
 */
export function MultiDayPicker<T extends string>({
  days,
  value,
  onChange,
}: {
  days: { value: T; label: string; full: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const toggle = (d: T) =>
    onChange(
      value.includes(d)
        ? value.filter((v) => v !== d)
        : days.map((x) => x.value).filter((v) => v === d || value.includes(v)),
    );
  const chosen = days.filter((d) => value.includes(d.value));
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={multi.grid}>
        {days.map((d) => {
          const on = value.includes(d.value);
          return (
            <Pressable
              key={d.value}
              onPress={() => toggle(d.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={d.full}
              style={[multi.day, on && multi.dayOn]}
            >
              {on ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
              <AppText
                style={{ color: on ? colors.white : colors.text, fontWeight: on ? '700' : '400' }}
              >
                {d.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText variant="small" accessibilityLiveRegion="polite">
        {chosen.length === 0
          ? 'No days selected yet.'
          : `Selected: ${chosen.map((d) => d.label).join(', ')}`}
      </AppText>
    </View>
  );
}

const multi = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  day: {
    flexBasis: '22%',
    flexGrow: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surface,
  },
  dayOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
});
