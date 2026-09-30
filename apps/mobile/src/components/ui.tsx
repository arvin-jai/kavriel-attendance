/** Small UI kit: consistent spacing, 44px+ touch targets, text + colour for every status. */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, fontFamily, radius, shadow, spacing } from '@/theme';

type Variant = 'hero' | 'title' | 'subtitle' | 'body' | 'muted' | 'small' | 'label';

const textStyles: Record<Variant, object> = {
  hero: { fontSize: font.hero, fontWeight: '700', color: colors.text },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.subtitle, fontWeight: '600', color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.body, color: colors.textMuted },
  small: { fontSize: font.small, color: colors.textMuted },
  label: {
    fontSize: font.label,
    fontWeight: '700',
    color: colors.text,
  },
};

/** Bold (weight 600 and up) maps to the bold family; everything else is regular. */
function isBold(weight: TextStyle['fontWeight']) {
  return weight === 'bold' || (weight !== undefined && Number(weight) >= 600);
}

/**
 * The one text component. Callers keep writing fontWeight; it is resolved to the matching
 * font family here, because Android does not pick a bold face of a custom font from fontWeight.
 */
export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const { fontWeight, ...flat } = StyleSheet.flatten([textStyles[variant], style]) as TextStyle;
  return (
    <Text
      maxFontSizeMultiplier={2}
      {...props}
      style={[{ fontFamily: isBold(fontWeight) ? fontFamily.bold : fontFamily.regular }, flat]}
    />
  );
}

/** Scrollable screen body with optional pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  padded = true,
  edges = [],
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
  /** Pinned under the content, e.g. the screen's one main action. */
  footer?: ReactNode;
}) {
  const content = { padding: padded ? spacing.lg : 0, gap: spacing.lg, paddingBottom: spacing.xxl };
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** lg (56px) is for the one main action on a screen. */
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primaryDark, border: colors.primary },
    tonal: { bg: colors.primaryContainer, fg: colors.primaryDark, border: colors.primaryContainer },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primaryDark, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  // A disabled button is a flat grey block (not a faded one) so its label stays readable.
  const fill = disabled ? colors.border : palette.bg;
  const line = disabled ? colors.border : palette.border;
  const ink = disabled ? colors.textMuted : palette.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && { minHeight: 56 },
        { backgroundColor: fill, borderColor: line },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={20} color={ink} /> : null}
          <AppText style={{ color: ink, fontSize: font.body, fontWeight: '700' }}>{title}</AppText>
        </View>
      )}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  containerStyle,
  ...props
}: TextInputProps & { label: string; error?: string; containerStyle?: ViewStyle }) {
  return (
    <View style={[{ gap: spacing.xs }, containerStyle]}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, error ? styles.inputError : null, props.style]}
      />
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={16} color={colors.absentFg} />
          <AppText style={{ color: colors.absentFg, fontSize: font.label, flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal single-choice chips (segmented control). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <View style={[styles.row, { flexWrap: 'wrap' }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              active && { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
            ]}
          >
            <AppText
              style={{
                color: active ? colors.white : colors.text,
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

export function Badge({
  label,
  fg,
  bg,
  icon,
}: {
  label: string;
  fg: string;
  bg: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={14} color={fg} /> : null}
      <AppText style={{ color: fg, fontSize: font.label, fontWeight: '700' }}>{label}</AppText>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="subtitle">{title}</AppText>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <View style={styles.stat}>
      <AppText style={{ fontSize: font.title, fontWeight: '700', color: tone ?? colors.text }}>
        {value}
      </AppText>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

// ───────────── Dashboard pieces ─────────────

/** Baby-blue banner card at the top of a dashboard. Text inside should use `colors.skyDeep`. */
export function Hero({ children }: { children: ReactNode }) {
  return <View style={styles.hero}>{children}</View>;
}

/** Icon + big number + label. Put two per row with `StatGrid`. */
export function StatTile({
  icon,
  label,
  value,
  tone = colors.primary,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string | number;
  tone?: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <AppText style={{ fontSize: font.title, fontWeight: '700', color: colors.text }}>
        {value}
      </AppText>
      <AppText variant="small">{label}</AppText>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.tile}>{body}</View>;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** Thin rounded progress bar; `value` is 0–100. */
export function ProgressBar({ value, tone = colors.primary }: { value: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
    </View>
  );
}

/** Round icon button with a caption, for a row of shortcuts. */
export function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <AppText variant="small" style={{ color: colors.text, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Pulsing placeholder block shown while data loads (calmer than a spinner per section). */
export function Skeleton({ height = 72 }: { height?: number }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, { height, opacity }]} />;
}

// ───────────── Screen states ─────────────

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <AppText variant="muted">{label}</AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  action,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.state}>
      <Ionicons name={icon} size={40} color={colors.textMuted} />
      <AppText variant="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="muted" style={{ textAlign: 'center' }}>
          {message}
        </AppText>
      ) : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state} accessibilityLiveRegion="assertive">
      <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
      <AppText variant="body" style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function Banner({
  tone,
  message,
}: {
  tone: 'danger' | 'warning' | 'info' | 'success';
  message: string;
}) {
  const map = {
    danger: [colors.danger, colors.dangerSoft],
    warning: [colors.warning, colors.warningSoft],
    info: [colors.info, colors.infoSoft],
    success: [colors.success, colors.successSoft],
  } as const;
  const [fg, bg] = map[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}
      accessibilityLiveRegion="polite"
    >
      <AppText style={{ color: fg, fontWeight: '600' }}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: {
    backgroundColor: colors.sky,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  action: { flex: 1, alignItems: 'center', gap: spacing.xs },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  skeleton: { borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: font.body,
    fontFamily: fontFamily.regular,
  },
  inputError: { borderColor: colors.absentFg, borderWidth: 2 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
