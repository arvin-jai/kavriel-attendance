import { createClassSchema } from '@kavriel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { errorMessage, fieldErrors } from '@/api/errors';
import { classesApi, referenceApi, subjectsApi } from '@/api/endpoints';
import {
  AppText,
  Banner,
  Button,
  Chips,
  EmptyState,
  LoadingState,
  Screen,
  TextField,
} from '@/components/ui';
import { validate } from '@/lib/validation';

/** Create a class (optionally pre-selecting `subjectId`), or edit one when `id` is given. */
export default function ClassForm() {
  const params = useLocalSearchParams<{ id?: string; subjectId?: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ['class', id],
    queryFn: () => classesApi.get(id!),
    enabled: !!id,
  });
  const subjects = useQuery({
    queryKey: ['subjects', 'ACTIVE'],
    queryFn: () => subjectsApi.list('ACTIVE'),
  });
  const semesters = useQuery({ queryKey: ['semesters'], queryFn: referenceApi.semesters });
  const current = useQuery({
    queryKey: ['semesters', 'current'],
    queryFn: referenceApi.currentSemester,
  });

  const [subjectId, setSubjectId] = useState<string | undefined>(params.subjectId);
  const [semesterId, setSemesterId] = useState<string | undefined>();
  const [sectionName, setSectionName] = useState('');
  const [classCode, setClassCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = existing.data;
    if (!c) return;
    setSubjectId(c.subject.id);
    setSemesterId(String(c.semester.id));
    setSectionName(c.sectionName);
    setClassCode(c.classCode);
  }, [existing.data]);

  useEffect(() => {
    if (!id && !semesterId && current.data) setSemesterId(String(current.data.id));
  }, [id, semesterId, current.data]);

  async function onSave() {
    setFormError(null);
    const v = validate(createClassSchema, {
      subjectId,
      semesterId: semesterId ? Number(semesterId) : undefined,
      sectionName,
      classCode,
    });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      const saved = id
        ? await classesApi.update(id, {
            sectionName: v.data.sectionName,
            classCode: v.data.classCode,
            semesterId: v.data.semesterId,
          })
        : await classesApi.create(v.data);
      void qc.invalidateQueries({ queryKey: ['classes'] });
      void qc.invalidateQueries({ queryKey: ['class', saved.id] });
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      router.back();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if ((id && existing.isPending) || subjects.isPending || semesters.isPending)
    return <LoadingState />;

  if (!id && subjects.data?.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="book-outline"
          title="Create a subject first"
          message="Every class belongs to a subject."
          action={
            <Button title="New subject" onPress={() => router.replace('/teacher/subject-form')} />
          }
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit class' : 'New class' }} />
      {formError ? <Banner tone="danger" message={formError} /> : null}

      <AppText variant="label">Subject</AppText>
      {id ? (
        <AppText>{existing.data?.subject.subjectName}</AppText>
      ) : (
        <Chips
          options={(subjects.data ?? []).map((s) => ({ value: s.id, label: s.subjectCode }))}
          value={subjectId}
          onChange={setSubjectId}
        />
      )}
      {errors.subjectId ? <Banner tone="danger" message="Choose a subject" /> : null}

      <AppText variant="label">Semester</AppText>
      <Chips
        options={(semesters.data ?? []).map((s) => ({
          value: String(s.id),
          label: `${s.name} ${s.academicYear.name}`,
        }))}
        value={semesterId}
        onChange={setSemesterId}
      />
      {errors.semesterId ? <Banner tone="danger" message="Choose a semester" /> : null}

      <TextField
        label="Section name"
        placeholder="Section A"
        value={sectionName}
        onChangeText={setSectionName}
        error={errors.sectionName}
      />
      <TextField
        label="Class code"
        placeholder="MATH101-A"
        value={classCode}
        onChangeText={setClassCode}
        autoCapitalize="characters"
        error={errors.classCode}
      />
      <Button title={id ? 'Save changes' : 'Create class'} onPress={onSave} loading={busy} />
    </Screen>
  );
}
