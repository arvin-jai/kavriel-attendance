-- A school year has three semesters: 1st, 2nd and 3rd (previously seeded as "Summer").
UPDATE "Semester" s
SET "name" = '3rd Semester'
WHERE s."name" = 'Summer'
  AND NOT EXISTS (
    SELECT 1 FROM "Semester" o
    WHERE o."academicYearId" = s."academicYearId" AND o."name" = '3rd Semester'
  );
