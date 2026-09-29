import type { AttendanceStatus, SessionStatus } from '@kavriel/shared';

export const colors = {
  primary: '#4338CA',
  primaryDark: '#3730A3',
  primarySoft: '#EEF2FF',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
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
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };
export const font = { small: 13, body: 15, subtitle: 17, title: 22, hero: 28 };

/** Status colours always pair with a text label (never colour alone). */
export const attendanceTone: Record<AttendanceStatus, { fg: string; bg: string; label: string }> = {
  PRESENT: { fg: colors.success, bg: colors.successSoft, label: 'Present' },
  LATE: { fg: colors.warning, bg: colors.warningSoft, label: 'Late' },
  ABSENT: { fg: colors.danger, bg: colors.dangerSoft, label: 'Absent' },
  EXCUSED: { fg: colors.info, bg: colors.infoSoft, label: 'Excused' },
};

export const sessionTone: Record<SessionStatus, { fg: string; bg: string; label: string }> = {
  PENDING: { fg: colors.textMuted, bg: colors.border, label: 'Pending' },
  ACTIVE: { fg: colors.success, bg: colors.successSoft, label: 'Active' },
  ENDED: { fg: colors.warning, bg: colors.warningSoft, label: 'Ended' },
  LOCKED: { fg: colors.textMuted, bg: colors.border, label: 'Locked' },
};
