import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { sessionsApi } from '@/api/endpoints';

import { LiveSessionPill } from './LiveSessionPill';

jest.mock('@/api/endpoints', () => ({ sessionsApi: { list: jest.fn() } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const list = sessionsApi.list as jest.Mock;

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const session = (id: string) => ({
  id,
  enrolledCount: 42,
  counts: { PRESENT: 30, LATE: 4, ABSENT: 0, EXCUSED: 0 },
  class: { subject: { subjectName: 'Math 9' } },
});

describe('LiveSessionPill', () => {
  it('shows the live class and how many are in', async () => {
    list.mockResolvedValue({ items: [session('s1')] });
    await render(<LiveSessionPill />, { wrapper: wrap() });
    expect(await screen.findByText('Live · Math 9 · 34 of 42 in')).toBeTruthy();
  });

  it('says when more than one session is running', async () => {
    list.mockResolvedValue({ items: [session('s1'), session('s2')] });
    await render(<LiveSessionPill />, { wrapper: wrap() });
    expect(await screen.findByText('+1 more running')).toBeTruthy();
  });

  it('renders nothing when no session is live', async () => {
    list.mockResolvedValue({ items: [] });
    await render(<LiveSessionPill />, { wrapper: wrap() });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Live ·/)).toBeNull();
  });
});
