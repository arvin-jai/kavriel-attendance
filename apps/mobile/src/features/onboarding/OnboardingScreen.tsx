import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

import type { OnboardingStep } from './content';

/** Full-screen, paged walkthrough. Shown once after sign-up/install and replayable from Profile. */
export function OnboardingScreen({
  steps,
  onDone,
}: {
  steps: OnboardingStep[];
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <AppText variant="small">
          {index + 1} of {steps.length}
        </AppText>
        {last ? null : <Button title="Skip" variant="ghost" onPress={onDone} />}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={step.icon} size={56} color={colors.primary} />
        </View>
        <AppText variant="title" style={styles.center} accessibilityRole="header">
          {step.title}
        </AppText>
        <AppText variant="muted" style={styles.center}>
          {step.body}
        </AppText>
        {step.tips?.map((tip) => (
          <View key={tip} style={styles.tip}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText style={styles.tipText}>{tip}</AppText>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden>
        {steps.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        {index > 0 ? (
          <Button
            title="Back"
            variant="secondary"
            style={styles.footerButton}
            onPress={() => setIndex(index - 1)}
          />
        ) : null}
        <Button
          title={last ? 'Get started' : 'Next'}
          style={styles.footerButton}
          onPress={() => (last ? onDone() : setIndex(index + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  body: { padding: spacing.xl, gap: spacing.lg, alignItems: 'stretch' },
  iconWrap: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  tipText: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, padding: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.primary },
  footer: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  footerButton: { flex: 1 },
});
