import { fireEvent, render, screen } from '@testing-library/react-native';

import { NowCard } from './NowCard';

describe('NowCard', () => {
  it('shows the class, the time and one action', async () => {
    const onPress = jest.fn();
    await render(
      <NowCard
        greeting="Good morning, Liza"
        date="Mon, Sep 29"
        label="Up next"
        time="7:30 AM"
        title="Math 9 · Sampaguita"
        meta="Until 8:30 AM · Room 204"
        action={{ title: 'Start attendance', onPress }}
      />,
    );
    expect(screen.getByText('Up next')).toBeTruthy();
    expect(screen.getByText('7:30')).toBeTruthy();
    expect(screen.getByText('Math 9 · Sampaguita')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Start attendance' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a message instead of details when nothing is scheduled', async () => {
    await render(
      <NowCard
        greeting="Hi"
        date="Mon"
        message="No more classes today."
        action={{ title: 'Scan', onPress: () => undefined }}
      />,
    );
    expect(screen.getByText('No more classes today.')).toBeTruthy();
    expect(screen.queryByText('Up next')).toBeNull();
  });
});
