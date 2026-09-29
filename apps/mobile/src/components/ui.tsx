/** Small UI kit: consistent spacing, 44px+ touch targets, text + colour for every status. */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '@/theme';

type Variant = 'hero' | 'title' | 'subtitle' | 'body' | 'muted' | 'small' | 'label';

const textStyles: Record<Variant, object> = {
  hero: { fontSize: font.hero, fontWeight: '700', color: colors.text },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: font.subtitle, fontWeight: '600', color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.body, color: colors.textMuted },
  small: { fontSize: font.small, color: colors.textMuted },
  label: {
    fontSize: font.small,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
};

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[textStyles[variant], style]} />;
}

/** Scrollable screen body with optional pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  scroll = true,
  padded = true,
  edges = [],
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
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

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    danger: { bg: colors.danger, fg: colors.white, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        inactive && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text style={{ color: palette.fg, fontSize: font.body, fontWeight: '600' }}>{title}</Text>
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
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? (
        <AppText style={{ color: colors.danger, fontSize: font.small }}>{error}</AppText>
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
              active && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            <Text style={{ color: active ? colors.white : colors.text, fontWeight: '600' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: font.small, fontWeight: '700' }}>{label}</Text>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: font.body,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
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
