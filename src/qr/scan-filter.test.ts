import { createQrScanFilter } from './scan-filter';

const A = 'waypost:cp:01935f3a-7c2e-7b41-9f0d-3c5a8e2b6d14:Ab3dEf7hJk9mNp2q';
const B = 'waypost:cp:01935f3a-7c2e-7b41-9f0d-3c5a8e2b6d15:Zz3dEf7hJk9mNp2q';

function setup() {
  let time = 0;
  const filter = createQrScanFilter({ quietMs: 2000, now: () => time });
  return {
    /** Reports the code at the given time. */
    see: (data: string, at: number) => {
      time = at;
      return filter(data);
    },
  };
}

test('a code held in view is read once', () => {
  const { see } = setup();
  expect(see(A, 0)).toEqual({ accepted: true, payload: A });
  for (let at = 100; at <= 10_000; at += 100) expect(see(A, at)).toBeNull();
});

test('the same code counts again after it has been out of view for the quiet time', () => {
  const { see } = setup();
  see(A, 0);
  expect(see(A, 1999)).toBeNull();
  expect(see(A, 3998)).toBeNull();
  expect(see(A, 5998)).toEqual({ accepted: true, payload: A });
});

test('two codes in view are tracked separately', () => {
  const { see } = setup();
  expect(see(A, 0)).toEqual({ accepted: true, payload: A });
  expect(see(B, 50)).toEqual({ accepted: true, payload: B });
  expect(see(A, 100)).toBeNull();
  expect(see(B, 150)).toBeNull();
});

test('other codes are reported as ignored, also once while in view', () => {
  const { see } = setup();
  expect(see('https://example.com', 0)).toEqual({ accepted: false, data: 'https://example.com' });
  expect(see('https://example.com', 100)).toBeNull();
  expect(see(A, 200)).toEqual({ accepted: true, payload: A });
});

test('uses a monotonic clock by default', () => {
  const now = jest.spyOn(performance, 'now').mockReturnValue(0);
  const filter = createQrScanFilter();
  expect(filter(A)).not.toBeNull();
  now.mockReturnValue(1999);
  expect(filter(A)).toBeNull();
  now.mockReturnValue(3999);
  expect(filter(A)).not.toBeNull();
  now.mockRestore();
});
