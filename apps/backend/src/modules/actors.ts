import { forbidden } from '../lib/http-errors';
import type { Actor, StudentActor, TeacherActor } from '../types/actor';

export function asTeacher(actor: Actor): TeacherActor {
  if (actor.role !== 'TEACHER' || !actor.teacherId) throw forbidden();
  return actor as TeacherActor;
}

export function asStudent(actor: Actor): StudentActor {
  if (actor.role !== 'STUDENT' || !actor.studentId) throw forbidden();
  return actor as StudentActor;
}
