import type { Ionicons } from '@expo/vector-icons';
import type { AttendanceStatus, SessionStatus } from '@kavriel/shared';
import type { ComponentProps } from 'react';

export const colors = {
  // Baby-blue theme. `primary` is a deeper blue so white text on buttons stays readable (≈5:1);
  // the light blues (`sky`, `primarySoft`, `background`) carry the soft look.
  primary: '#1A74B8',
  primaryDark: '#135E99',
  primarySoft: '#DCEEFB',
  sky: '#BFE3F8',
  skyDeep: '#0B3A5B',
  background: '#F2F8FD',
  surface: '#FFFFFF',
  text: '#0F2A3F',
  textMuted: '#587086',
  border: '#D5E6F3',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#15803D',
  successSoft: '#F0FDF4',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  info: '#0369A1',
  infoSoft: '#F0F9FF',
  white: '#FFFFFF',
  black: '#000000',
  /** Tonal fills: secondary buttons, the active tab indicator. */
  primaryContainer: '#DCEEFB',
  /** Text on the sky Now card. */
  onSky: '#0B3A5B',
  /** Backdrop behind bottom sheets. */
  scrim: 'rgba(11,34,51,0.5)',
  /** Text field outline, 3.6:1 on white (the card border alone is too faint for inputs). */
  inputBorder: '#5F8CAF',
  // Text-safe status pairs, each at least 4.5:1 on its own fill (danger #DC2626 on
  // #FEF2F2 is only 4.4:1, so the statuses do not use it for text).
  presentFg: '#0F5B33',
  presentBg: '#DDF3E4',
  lateFg: '#7A4200',
  lateBg: '#FFEBC7',
  absentFg: '#9B1526',
  absentBg: '#FDE1E4',
  excusedFg: '#34378F',
  excusedBg: '#E6E7FB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Buttons and fields use md, cards lg, sheets xl. pill is for avatars only. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

/** Soft blue shadow shared by cards (iOS shadow + Android elevation; ignored on web borders). */
export const shadow = {
  shadowColor: '#1A74B8',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const;
export const font = {
  caption: 13,
  small: 13,
  label: 14,
  body: 16,
  subtitle: 18,
  title: 24,
  hero: 32,
  display: 32,
  time: 48,
};

/** Android picks a face by family name, not by fontWeight, so weights map to families. */
export const fontFamily = {
  regular: 'AtkinsonHyperlegible_400Regular',
  bold: 'AtkinsonHyperlegible_700Bold',
};

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Status colours always pair with an icon and a text label (never colour alone). */
export const attendanceTone: Record<
  AttendanceStatus,
  { fg: string; bg: string; label: string; icon: IconName }
> = {
  PRESENT: { fg: colors.presentFg, bg: colors.presentBg, label: 'Present', icon: 'checkmark' },
  LATE: { fg: colors.lateFg, bg: colors.lateBg, label: 'Late', icon: 'time-outline' },
  ABSENT: { fg: colors.absentFg, bg: colors.absentBg, label: 'Absent', icon: 'close' },
  EXCUSED: { fg: colors.excusedFg, bg: colors.excusedBg, label: 'Excused', icon: 'remove' },
};

export const sessionTone: Record<SessionStatus, { fg: string; bg: string; label: string }> = {
  PENDING: { fg: colors.textMuted, bg: colors.border, label: 'Pending' },
  ACTIVE: { fg: colors.success, bg: colors.successSoft, label: 'Active' },
  ENDED: { fg: colors.warning, bg: colors.warningSoft, label: 'Ended' },
  LOCKED: { fg: colors.textMuted, bg: colors.border, label: 'Locked' },
};
