/**
 * User-facing wording in one place, so the tone stays consistent and a Filipino translation is a
 * one-file job later. Rule for every message: what happened, what it means for the record, and
 * what to do next. Anything that stops a check-in says "NOT checked in" / "Not saved yet".
 */
export const copy = {
  offline: {
    banner: "You're offline. Attendance can't be recorded until you reconnect.",
    needsConnection: 'Needs a connection.',
  },

  scan: {
    hint: "Point your camera at the QR code on your teacher's screen.",
    sendingTitle: 'Sending your check-in',
    sendingText: 'Not saved yet. Keep this screen open.',
    checkingTitle: 'Checking with the server',
    checkingText: 'Connection problem. Making sure you were recorded. Not saved yet.',
    slowText: 'Still trying. It is not saved yet. Keep this screen open.',
    successTitle: "You're checked in",
    successText: 'Saved to your record.',
    successReconciled: 'Confirmed with the server after the connection dropped.',
    failureTitle: 'Not checked in',
    scanAgain: 'Scan again',
  },

  empty: {
    teacherClasses: 'No classes yet',
    teacherClassesText: 'Create a class (section) for one of your subjects.',
    studentClasses: "You're not in a class yet",
    studentClassesText: (studentNumber: string) =>
      `Your teacher adds you with your student number, ${studentNumber}. Nothing to do until then.`,
    studentHistory: 'No attendance yet',
    studentHistoryText: 'Your records show up after your first class.',
    activeSessions: 'No active attendance',
    activeSessionsText: 'Start attendance from Home or a class.',
  },

  qr: {
    newCodeIn: (seconds: number) => `New code in ${seconds} s`,
    gettingCode: 'Getting a fresh code…',
    bigger: 'Bigger QR',
    smaller: 'Show counts',
    endTitle: 'End attendance?',
    endPending: (n: number) =>
      `${n} student${n === 1 ? " hasn't" : "s haven't"} checked in and will be marked absent. You can still correct records before locking.`,
    endAll: 'Everyone has a record. Students can no longer check in.',
  },

  livePill: (subject: string, inCount: number, enrolled: number) =>
    `Live · ${subject} · ${inCount} of ${enrolled} in`,
  livePillMore: (n: number) => `+${n} more running`,
} as const;
