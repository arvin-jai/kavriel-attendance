import type { Role } from '@kavriel/shared';
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export interface OnboardingStep {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  tips?: string[];
}

const teacher: OnboardingStep[] = [
  {
    icon: 'qr-code-outline',
    title: 'Welcome to Kavriel',
    body: 'Take attendance by showing a QR code that students scan with their phones. No paper, no roll call.',
  },
  {
    icon: 'library-outline',
    title: '1. Set up your classes',
    body: 'Do this once per class from the bottom tabs.',
    tips: [
      'Subjects: add the subjects you teach.',
      'Classes: create a section for a subject, then add your students by their student number (they must register in the app first).',
      'Schedule: add the days, times and room for each class.',
    ],
  },
  {
    icon: 'play-circle-outline',
    title: '2. Start attendance',
    body: 'On the Home tab, tap Start Attendance on today’s class, or start an ad-hoc session.',
    tips: [
      'You can start from 15 minutes before the scheduled time.',
      'Students can only check in while the session is active.',
    ],
  },
  {
    icon: 'scan-outline',
    title: '3. Show the QR code',
    body: 'Open the QR screen and hold it up or project it. The code changes every few seconds.',
    tips: [
      'A screenshot or a forwarded photo stops working quickly.',
      'The live count updates as students check in.',
      'Keep the screen on while students scan.',
    ],
  },
  {
    icon: 'create-outline',
    title: '4. Review and correct',
    body: 'Anyone who did not scan can be marked Present, Late, Absent or Excused, with a remark.',
    tips: ['Tap End attendance when class is over. Students who did not scan become Absent.'],
  },
  {
    icon: 'lock-closed-outline',
    title: '5. Lock and report',
    body: 'Lock a session to make the record final. Reports show attendance by class, student and date, and export to CSV.',
    tips: ['You can replay this guide any time from Profile → How to use Kavriel.'],
  },
];

const student: OnboardingStep[] = [
  {
    icon: 'qr-code-outline',
    title: 'Welcome to Kavriel',
    body: 'Record your attendance by scanning your teacher’s QR code. It takes a few seconds.',
  },
  {
    icon: 'school-outline',
    title: 'Your classes',
    body: 'My Classes shows the classes your teacher enrolled you in, with schedules and your attendance for each.',
    tips: [
      'Don’t see a class? Ask your teacher to add you using your student number.',
      'Check the Schedule tab to see when your classes meet.',
    ],
  },
  {
    icon: 'scan-outline',
    title: 'Scan to check in',
    body: 'When class starts, open the Scan tab and point your camera at the QR on your teacher’s screen.',
    tips: [
      'Allow camera access when asked.',
      'Wait for “Attendance recorded” before you put your phone away.',
      'You can only check in once per session.',
    ],
  },
  {
    icon: 'alert-circle-outline',
    title: 'If a scan fails',
    body: 'The QR changes every few seconds, so scan it live from your teacher’s screen.',
    tips: [
      '“QR expired”: scan the current code, not a photo or screenshot.',
      '“Not enrolled”: ask your teacher to add you to the class.',
      'No signal: move closer to Wi-Fi and try again. Nothing is saved until you see confirmation.',
    ],
  },
  {
    icon: 'stats-chart-outline',
    title: 'Track your attendance',
    body: 'The Attendance tab shows every session with its status, plus your attendance percentage.',
    tips: ['You can replay this guide any time from Profile → How to use Kavriel.'],
  },
];

export const onboardingSteps: Record<Role, OnboardingStep[]> = {
  TEACHER: teacher,
  STUDENT: student,
};
