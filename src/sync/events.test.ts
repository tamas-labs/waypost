import { emitConfigurationPulled, emitOutboxQueued, onConfigurationPulled, onOutboxQueued, type PullSummary } from './events';

it('calls the other listeners when one throws, until they unsubscribe', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const pulled = jest.fn();
  const queued = jest.fn();
  const stops = [
    onConfigurationPulled(() => {
      throw new Error('broken');
    }),
    onConfigurationPulled(pulled),
    onOutboxQueued(() => {
      throw new Error('broken');
    }),
    onOutboxQueued(queued),
  ];

  emitConfigurationPulled({} as PullSummary);
  emitOutboxQueued();
  expect(pulled).toHaveBeenCalledTimes(1);
  expect(queued).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(2);

  stops.forEach((stop) => stop());
  emitConfigurationPulled({} as PullSummary);
  emitOutboxQueued();
  expect(pulled).toHaveBeenCalledTimes(1);
  expect(queued).toHaveBeenCalledTimes(1);
  error.mockRestore();
});
