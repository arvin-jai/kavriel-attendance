/**
 * Idempotent seed.
 *
 * Always: roles, year levels, academic years and semesters (reference data the app needs).
 * Development only (NODE_ENV !== 'production'): a demo teacher and students with a subject,
 * class, schedule and enrollments, so the app is usable immediately.
 *
 *   npm run seed -w @kavriel/backend
 */
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

import { PrismaClient } from '../src/generated/prisma/client';
import type { DayOfWeek } from '../src/generated/prisma/enums';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL (or DIRECT_URL) must be set to seed');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const date = (iso: string) => new Date(`${iso}T00:00:00Z`);
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

async function seedReference() {
  for (const name of ['TEACHER', 'STUDENT']) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  for (const [i, name] of yearLevels.entries()) {
    await prisma.yearLevel.upsert({
      where: { name },
      update: { sortOrder: i + 1 },
      create: { name, sortOrder: i + 1 },
    });
  }

  const years = [
    {
      name: '2025-2026',
      start: '2025-08-01',
      end: '2026-07-31',
      semesters: [
        ['1st Semester', '2025-08-01', '2025-12-20'],
        ['2nd Semester', '2026-01-05', '2026-05-31'],
        ['Summer', '2026-06-01', '2026-07-31'],
      ],
    },
    {
      name: '2026-2027',
      start: '2026-08-01',
      end: '2027-07-31',
      semesters: [
        ['1st Semester', '2026-08-01', '2026-12-20'],
        ['2nd Semester', '2027-01-04', '2027-05-31'],
        ['Summer', '2027-06-01', '2027-07-31'],
      ],
    },
  ] as const;

  for (const y of years) {
    const ay = await prisma.academicYear.upsert({
      where: { name: y.name },
      update: {},
      create: { name: y.name, startDate: date(y.start), endDate: date(y.end) },
    });
    for (const [name, start, end] of y.semesters) {
      await prisma.semester.upsert({
        where: { academicYearId_name: { academicYearId: ay.id, name } },
        update: {},
        create: { academicYearId: ay.id, name, startDate: date(start), endDate: date(end) },
      });
    }
  }
}

/** Demo data for local development. Credentials are documented in apps/backend/README.md. */
async function seedDemo() {
  const password = await argon2.hash('password123', { type: argon2.argon2id as 0 | 1 | 2 });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { name: 'TEACHER' } });
  const studentRole = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
  const firstYear = await prisma.yearLevel.findUniqueOrThrow({ where: { name: '1st Year' } });

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@kavriel.test' },
    update: {},
    create: { email: 'teacher@kavriel.test', passwordHash: password, roleId: teacherRole.id },
  });
  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      userId: teacherUser.id,
      firstName: 'Maria',
      lastName: 'Santos',
      employeeNumber: 'EMP-0001',
    },
  });

  const students = [
    ['student1@kavriel.test', '2026-0001', 'Juan', 'Dela Cruz'],
    ['student2@kavriel.test', '2026-0002', 'Ana', 'Reyes'],
    ['student3@kavriel.test', '2026-0003', 'Jose', 'Garcia'],
  ] as const;
  const studentIds: string[] = [];
  for (const [email, studentNumber, firstName, lastName] of students) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: password, roleId: studentRole.id },
    });
    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, studentNumber, firstName, lastName, yearLevelId: firstYear.id },
    });
    studentIds.push(student.id);
  }

  const subject = await prisma.subject.upsert({
    where: { ownerTeacherId_subjectCode: { ownerTeacherId: teacher.id, subjectCode: 'MATH101' } },
    update: {},
    create: {
      ownerTeacherId: teacher.id,
      subjectCode: 'MATH101',
      subjectName: 'Mathematics in the Modern World',
      yearLevelId: firstYear.id,
      units: 3,
    },
  });

  const ay = await prisma.academicYear.findUniqueOrThrow({ where: { name: '2026-2027' } });
  const semester = await prisma.semester.findUniqueOrThrow({
    where: { academicYearId_name: { academicYearId: ay.id, name: '1st Semester' } },
  });

  const cls = await prisma.classSection.upsert({
    where: {
      teacherId_semesterId_classCode: {
        teacherId: teacher.id,
        semesterId: semester.id,
        classCode: 'MATH101-A',
      },
    },
    update: {},
    create: {
      classCode: 'MATH101-A',
      sectionName: 'Section A',
      subjectId: subject.id,
      teacherId: teacher.id,
      semesterId: semester.id,
    },
  });

  for (const studentId of studentIds) {
    await prisma.enrollment.upsert({
      where: { classId_studentId: { classId: cls.id, studentId } },
      update: {},
      create: { classId: cls.id, studentId },
    });
  }

  const hasSchedules = await prisma.schedule.count({ where: { classId: cls.id } });
  if (!hasSchedules) {
    const days: DayOfWeek[] = ['MON', 'WED', 'FRI'];
    for (const dayOfWeek of days) {
      await prisma.schedule.create({
        data: {
          classId: cls.id,
          dayOfWeek,
          startTime: time('09:00'),
          endTime: time('10:30'),
          room: 'Room 201',
        },
      });
    }
  }
}

async function main() {
  await seedReference();
  console.log('Seeded reference data (roles, year levels, academic years, semesters).');
  if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== 'false') {
    await seedDemo();
    console.log(
      'Seeded demo data: teacher@kavriel.test / student1..3@kavriel.test (password: password123).',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
