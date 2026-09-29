import type { SemesterDto, YearLevelDto } from '@kavriel/shared';

import { prisma } from '../../config/database';
import { clock } from '../../lib/time';

function toSemesterDto(s: {
  id: number;
  name: string;
  startDate: Date;
  endDate: Date;
  academicYear: { id: number; name: string };
}): SemesterDto {
  return {
    id: s.id,
    name: s.name,
    startDate: s.startDate.toISOString().slice(0, 10),
    endDate: s.endDate.toISOString().slice(0, 10),
    academicYear: { id: s.academicYear.id, name: s.academicYear.name },
  };
}

export async function listYearLevels(): Promise<YearLevelDto[]> {
  return prisma.yearLevel.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });
}

export async function listSemesters(): Promise<SemesterDto[]> {
  const rows = await prisma.semester.findMany({
    include: { academicYear: true },
    orderBy: [{ startDate: 'desc' }],
  });
  return rows.map(toSemesterDto);
}

/** The semester containing today; otherwise the next upcoming one; otherwise the most recent. */
export async function currentSemester(): Promise<SemesterDto | null> {
  const today = new Date(clock.now().toISOString().slice(0, 10));
  const include = { academicYear: true } as const;
  const found =
    (await prisma.semester.findFirst({
      where: { startDate: { lte: today }, endDate: { gte: today } },
      include,
    })) ??
    (await prisma.semester.findFirst({
      where: { startDate: { gt: today } },
      orderBy: { startDate: 'asc' },
      include,
    })) ??
    (await prisma.semester.findFirst({ orderBy: { endDate: 'desc' }, include }));
  return found ? toSemesterDto(found) : null;
}
