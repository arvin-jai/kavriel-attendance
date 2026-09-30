import type { CheckInResultDto } from '@kavriel/shared';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SLOW_AFTER_MS, ScanResultSheet } from './ScanResultSheet';

const result = (status: CheckInResultDto['attendance']['status']): CheckInResultDto => ({
  alreadyRecorded: false,
  attendance: { id: 'a1', status, checkInTime: '2026-09-29T07:32:00.000Z' },
  session: {
    id: 's1',
    classCode: 'MATH9',
    sectionName: 'Sampaguita',
    subjectCode: 'MATH',
    subjectName: 'Math 9',
  },
});

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 740 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
);
const show = (ui: ReactElement) => render(ui, { wrapper: Wrapper });

describe('ScanResultSheet', () => {
  afterEach(() => jest.useRealTimers());

  it('renders nothing without a state', async () => {
    await show(<ScanResultSheet state={null} onDone={jest.fn()} onRetry={jest.fn()} />);
    expect(screen.queryByText('Not saved yet. Keep this screen open.')).toBeNull();
  });

  it('says nothing is saved while sending, with no button to press', async () => {
    await show(
      <ScanResultSheet state={{ kind: 'sending' }} onDone={jest.fn()} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('Sending your check-in')).toBeTruthy();
    expect(screen.getByText('Not saved yet. Keep this screen open.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText("You're checked in")).toBeNull();
  });

  it('says so when the server is slow to answer', async () => {
    jest.useFakeTimers();
    await show(
      <ScanResultSheet state={{ kind: 'sending' }} onDone={jest.fn()} onRetry={jest.fn()} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(SLOW_AFTER_MS + 100);
    });
    expect(
      screen.getByText('Still trying. It is not saved yet. Keep this screen open.'),
    ).toBeTruthy();
  });

  it('explains the reconnect check', async () => {
    await show(
      <ScanResultSheet state={{ kind: 'checking' }} onDone={jest.fn()} onRetry={jest.fn()} />,
    );
    expect(screen.getByText('Checking with the server')).toBeTruthy();
  });

  it('shows the class, status word and a Done button on success', async () => {
    const onDone = jest.fn();
    await show(
      <ScanResultSheet
        state={{ kind: 'success', result: result('LATE'), reconciled: false }}
        onDone={onDone}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText("You're checked in")).toBeTruthy();
    expect(screen.getByText('Saved to your record.')).toBeTruthy();
    expect(screen.getByText('Late')).toBeTruthy();
    expect(screen.getByText('Math 9 · Sampaguita')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('mentions the server confirmation after a dropped connection', async () => {
    await show(
      <ScanResultSheet
        state={{ kind: 'success', result: result('PRESENT'), reconciled: true }}
        onDone={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Confirmed with the server after the connection dropped.'),
    ).toBeTruthy();
  });

  it('says NOT checked in on failure and offers Scan again', async () => {
    const onRetry = jest.fn();
    await show(
      <ScanResultSheet
        state={{ kind: 'error', title: 'Not enrolled', message: 'You are not in this class.' }}
        onDone={jest.fn()}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Not checked in')).toBeTruthy();
    expect(screen.getByText('Not enrolled')).toBeTruthy();
    expect(screen.getByText('You are not in this class.')).toBeTruthy();
    expect(screen.queryByText("You're checked in")).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Scan again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
