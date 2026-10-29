import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/theme-provider';

import { SegmentedControl } from './segmented-control';
import { Switch } from './switch';

const OPTIONS = [
  { value: 'list', label: 'Lista' },
  { value: 'map', label: 'Térkép' },
] as const;

test('the segmented control has a radio per option, the current one checked', async () => {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <SegmentedControl accessibilityLabel="Nézet" options={OPTIONS} value="list" onChange={onChange} />
    </ThemeProvider>,
  );
  expect(screen.getByRole('radio', { name: 'Lista' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Térkép' })).not.toBeChecked();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Lista' })));
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Térkép' })));
  expect(onChange).toHaveBeenCalledWith('map');
});

test('the switch reports its state and its changes', async () => {
  const onValueChange = jest.fn();
  await render(
    <ThemeProvider>
      <Switch accessibilityLabel="Napi jelentés" value onValueChange={onValueChange} />
    </ThemeProvider>,
  );
  const control = screen.getByRole('switch', { name: 'Napi jelentés' });
  expect(control).toBeChecked();
  await act(async () => fireEvent(control, 'valueChange', false));
  expect(onValueChange).toHaveBeenCalledWith(false);
});
