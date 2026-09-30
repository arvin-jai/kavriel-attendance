import type { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps, ReactNode } from 'react';

import { colors, radius, shadow, spacing } from '@/theme';

import { AppText } from './ui';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Name of the route that renders as the raised centre key (the student's scanner). */
const RAISED_ROUTE = 'scan';

/**
 * Floating tab bar: a rounded white card with an indicator behind the active icon and a raised
 * key for the scanner. It sits in normal layout (not over the content), so screens need no extra
 * bottom padding. Plug it in with `<Tabs tabBar={(props) => <FloatingTabBar {...props} />}>`.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  top,
}: TabBarProps & { top?: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  const hasRaised = state.routes.some((r) => r.name === RAISED_ROUTE);

  return (
    <View
      style={[
        styles.wrap,
        { paddingBottom: Math.max(bottom, spacing.sm) + spacing.xs },
        hasRaised && { paddingTop: spacing.xl },
      ]}
    >
      {top}
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const label = String(options.tabBarLabel ?? options.title ?? route.name);
          const raised = route.name === RAISED_ROUTE;
          const tint = focused ? colors.onSky : colors.textMuted;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityState={{ selected: focused }}
              style={styles.tab}
            >
              {raised ? (
                <View style={[styles.raised, focused && { backgroundColor: colors.primaryDark }]}>
                  {options.tabBarIcon?.({ focused, color: colors.white, size: 28 })}
                </View>
              ) : (
                <>
                  <View style={[styles.indicator, focused && styles.indicatorOn]}>
                    {options.tabBarIcon?.({ focused, color: tint, size: 24 })}
                  </View>
                  <AppText
                    numberOfLines={1}
                    style={{
                      color: tint,
                      fontSize: 13,
                      fontWeight: focused ? '700' : '400',
                    }}
                  >
                    {label}
                  </AppText>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
    elevation: 6,
  },
  tab: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  indicator: {
    width: 56,
    height: 30,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorOn: { backgroundColor: colors.primaryContainer },
  raised: {
    width: 60,
    height: 60,
    marginTop: -34,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.background,
    ...shadow,
    shadowOpacity: 0.3,
    elevation: 6,
  },
});
