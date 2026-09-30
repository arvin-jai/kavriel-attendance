import { colors, font, fontFamily } from '@/theme';

/** Shared navigation chrome: soft baby-blue header, white tab bar with readable labels. */
export const headerOptions = {
  headerStyle: { backgroundColor: colors.primarySoft },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.skyDeep, fontFamily: fontFamily.bold, fontSize: font.subtitle },
};

export const tabBarOptions = {
  ...headerOptions,
  tabBarActiveTintColor: colors.primaryDark,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarLabelStyle: { fontSize: font.caption, fontFamily: fontFamily.regular },
  tabBarStyle: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 68,
    paddingTop: 6,
    paddingBottom: 8,
  },
};
