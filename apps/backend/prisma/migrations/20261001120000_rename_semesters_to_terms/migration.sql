-- Terms instead of semesters: "1st Semester" → "1st Term", etc.
UPDATE "Semester" s
SET "name" = REPLACE(s."name", ' Semester', ' Term')
WHERE s."name" IN ('1st Semester', '2nd Semester', '3rd Semester')
  AND NOT EXISTS (
    SELECT 1 FROM "Semester" o
    WHERE o."academicYearId" = s."academicYearId"
      AND o."name" = REPLACE(s."name", ' Semester', ' Term')
  );
