import type { Role } from '@kavriel/shared';

/** The authenticated caller, loaded from the database on every request (never from token claims). */
export interface Actor {
  userId: string;
  email: string;
  role: Role;
  teacherId: string | null;
  studentId: string | null;
}

export interface TeacherActor extends Actor {
  role: 'TEACHER';
  teacherId: string;
}

export interface StudentActor extends Actor {
  role: 'STUDENT';
  studentId: string;
}
