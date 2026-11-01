import { AppState, type AppStateStatus } from 'react-native';

import { onForeground, whileInForeground } from './foreground';

let listener: (state: AppStateStatus) => void;
const remove = jest.fn();

function appStateIs(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });
}

beforeEach(() => {
  jest.useFakeTimers();
  remove.mockClear();
  appStateIs('active');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    listener = handler as typeof listener;
    return { remove };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('onForeground', () => {
  it('calls back on coming back, not on staying active', () => {
    const onReturn = jest.fn();
    const stop = onForeground(onReturn);

    listener('active');
    expect(onReturn).not.toHaveBeenCalled();
    listener('background');
    listener('active');
    expect(onReturn).toHaveBeenCalledTimes(1);

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('counts a start in the background as away', () => {
    appStateIs('background');
    const onReturn = jest.fn();
    onForeground(onReturn);

    listener('active');
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});

describe('whileInForeground', () => {
  it('runs the task only in the foreground, and calls back on coming back', () => {
    const task = jest.fn();
    const onReturn = jest.fn();
    const stop = whileInForeground(task, 1000, onReturn);

    jest.advanceTimersByTime(2000);
    expect(task).toHaveBeenCalledTimes(2);

    listener('background');
    jest.advanceTimersByTime(5000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onReturn).not.toHaveBeenCalled();

    listener('active');
    expect(onReturn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(3);

    stop();
    jest.advanceTimersByTime(5000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('waits for the foreground when started in the background', () => {
    appStateIs('background');
    const task = jest.fn();
    whileInForeground(task, 1000, () => {});

    jest.advanceTimersByTime(5000);
    expect(task).not.toHaveBeenCalled();

    listener('active');
    jest.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
