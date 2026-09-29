import { createSubjectSchema } from '@kavriel/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { errorMessage, fieldErrors } from '@/api/errors';
import { referenceApi, subjectsApi } from '@/api/endpoints';
import { AppText, Banner, Button, Chips, LoadingState, Screen, TextField } from '@/components/ui';
import { blankToUndefined, validate } from '@/lib/validation';

/** Create a subject, or edit one when `id` is given. */
export default function SubjectForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ['subject', id],
    queryFn: () => subjectsApi.get(id!),
    enabled: !!id,
  });
  const yearLevels = useQuery({ queryKey: ['yearLevels'], queryFn: referenceApi.yearLevels });

  const [form, setForm] = useState({
    subjectCode: '',
    subjectName: '',
    description: '',
    units: '',
  });
  const [yearLevelId, setYearLevelId] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = existing.data;
    if (!s) return;
    setForm({
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      description: s.description ?? '',
      units: s.units ? String(s.units) : '',
    });
    setYearLevelId(s.yearLevel ? String(s.yearLevel.id) : undefined);
  }, [existing.data]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSave() {
    setFormError(null);
    const v = validate(
      createSubjectSchema,
      blankToUndefined({
        ...form,
        units: form.units ? Number(form.units) : undefined,
        yearLevelId: yearLevelId ? Number(yearLevelId) : undefined,
      }),
    );
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      const saved = id ? await subjectsApi.update(id, v.data) : await subjectsApi.create(v.data);
      void qc.invalidateQueries({ queryKey: ['subjects'] });
      void qc.invalidateQueries({ queryKey: ['subject', saved.id] });
      router.back();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (id && existing.isPending) return <LoadingState />;

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit subject' : 'New subject' }} />
      {formError ? <Banner tone="danger" message={formError} /> : null}
      <TextField
        label="Subject code"
        placeholder="MATH101"
        value={form.subjectCode}
        onChangeText={set('subjectCode')}
        autoCapitalize="characters"
        error={errors.subjectCode}
      />
      <TextField
        label="Subject name"
        placeholder="Mathematics in the Modern World"
        value={form.subjectName}
        onChangeText={set('subjectName')}
        error={errors.subjectName}
      />
      <TextField
        label="Description (optional)"
        value={form.description}
        onChangeText={set('description')}
        multiline
        error={errors.description}
      />
      <TextField
        label="Units (optional)"
        value={form.units}
        onChangeText={set('units')}
        keyboardType="decimal-pad"
        error={errors.units}
      />
      {yearLevels.data?.length ? (
        <>
          <AppText variant="label">Year level (optional)</AppText>
          <Chips
            options={yearLevels.data.map((y) => ({ value: String(y.id), label: y.name }))}
            value={yearLevelId}
            onChange={(v) => setYearLevelId(v === yearLevelId ? undefined : v)}
          />
        </>
      ) : null}
      <Button title={id ? 'Save changes' : 'Create subject'} onPress={onSave} loading={busy} />
    </Screen>
  );
}
