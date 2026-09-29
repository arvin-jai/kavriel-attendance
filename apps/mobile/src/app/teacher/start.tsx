import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import { classesApi, schedulesApi, sessionsApi } from '@/api/endpoints';
import { AppText, Banner, Button, Chips, EmptyState, LoadingState, Screen } from '@/components/ui';
import { formatClock } from '@/lib/format';

/**
 * Start attendance for a class. If the class meets today and the start window is open,
 * the session is tied to that schedule; otherwise it is an ad-hoc session (audited as such).
 */
export default function StartAttendance() {
  const params = useLocalSearchParams<{ classId?: string }>();
  const qc = useQueryClient();
  const classes = useQuery({
    queryKey: ['classes', { status: 'ACTIVE' }],
    queryFn: () => classesApi.list({ status: 'ACTIVE' }),
  });
  const today = useQuery({ queryKey: ['today'], queryFn: schedulesApi.today });

  const [classId, setClassId] = useState<string | undefined>(params.classId);
  const [late, setLate] = useState('15');
  const [rotation, setRotation] = useState('15');
  const [error, setError] = useState<string | null>(null);

  const todaysSlot = today.data?.find((s) => s.class.id === classId && s.canStart);

  const start = useMutation({
    mutationFn: () =>
      sessionsApi.create({
        classId: classId!,
        scheduleId: todaysSlot?.id,
        lateAfterMinutes: Number(late),
        qrRotationSeconds: Number(rotation),
      }),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      router.replace({ pathname: '/teacher/session/[id]/qr', params: { id: session.id } });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (classes.isPending) return <LoadingState />;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Start attendance' }} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {classes.data?.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No active classes"
          message="Create a class and enroll students first."
        />
      ) : (
        <>
          <AppText variant="label">Class</AppText>
          <Chips
            options={(classes.data ?? []).map((c) => ({
              value: c.id,
              label: `${c.classCode} (${c.enrolledCount})`,
            }))}
            value={classId}
            onChange={(v) => {
              setClassId(v);
              setError(null);
            }}
          />
          {classId ? (
            <Banner
              tone="info"
              message={
                todaysSlot
                  ? `Linked to today's ${formatClock(todaysSlot.startTime)}–${formatClock(todaysSlot.endTime)} class.`
                  : 'No scheduled class right now, so this will be an ad-hoc session.'
              }
            />
          ) : null}

          <AppText variant="label">Mark late after</AppText>
          <Chips
            options={['5', '10', '15', '20', '30'].map((v) => ({ value: v, label: `${v} min` }))}
            value={late}
            onChange={setLate}
          />
          <AppText variant="label">QR refreshes every</AppText>
          <Chips
            options={['10', '15', '20', '30'].map((v) => ({ value: v, label: `${v} s` }))}
            value={rotation}
            onChange={setRotation}
          />
          <AppText variant="small">
            Shorter refresh intervals make shared screenshots useless sooner.
          </AppText>

          <Button
            title="Start attendance"
            icon="play"
            disabled={!classId}
            loading={start.isPending}
            onPress={() => start.mutate()}
          />
        </>
      )}
    </Screen>
  );
}
