import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { attendanceTone, fontFamily } from '@/theme';

import { StatusBadge } from './common';
import { AppText, Button } from './ui';

describe('StatusBadge', () => {
  it.each(Object.entries(attendanceTone))(
    'shows the word for %s, not only a colour',
    async (status, tone) => {
      await render(<StatusBadge status={status as keyof typeof attendanceTone} />);
      expect(screen.getByText(tone.label)).toBeTruthy();
    },
  );

  it('shows "Not yet" when there is no record', async () => {
    await render(<StatusBadge status={null} />);
    expect(screen.getByText('Not yet')).toBeTruthy();
  });
});

describe('AppText', () => {
  it('maps fontWeight to the matching font family and drops fontWeight', async () => {
    await render(
      <>
        <AppText style={{ fontWeight: '700' }}>bold</AppText>
        <AppText>regular</AppText>
      </>,
    );
    const bold = StyleSheet.flatten(screen.getByText('bold').props.style);
    const regular = StyleSheet.flatten(screen.getByText('regular').props.style);
    expect(bold.fontFamily).toBe(fontFamily.bold);
    expect(regular.fontFamily).toBe(fontFamily.regular);
    expect(bold.fontWeight).toBeUndefined();
  });
});

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled or loading', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button title="Off" onPress={onPress} disabled />
        <Button title="Busy" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByText('Off'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });

  it('uses a 56px minimum height for the large size', async () => {
    await render(<Button title="Start" onPress={() => undefined} size="lg" />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Start' }).props.style);
    expect(style.minHeight).toBe(56);
  });
});
