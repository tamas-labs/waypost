import { printAsync, printToFileAsync } from 'expo-print';
import { shareAsync } from 'expo-sharing';

import { palette } from '@/theme/tokens';

import { qrDrawing } from './code';
import { printQrLabel, qrLabelFileName, qrLabelHtml, shareQrLabel, type QrLabel } from './label';

jest.mock('expo-print', () => ({ printAsync: jest.fn(), printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(() => Promise.resolve()) }));
// The module's files and the test's are the same in-memory ones (__mocks__/expo-file-system.ts).
jest.mock('expo-file-system');
const { files } = jest.requireMock<typeof import('../../__mocks__/expo-file-system')>('expo-file-system');

const LABEL: QrLabel = {
  name: 'Főkapu – sorompó',
  site: 'Logisztikai központ, Gyál',
  payload: 'waypost:cp:019a2b3c-4d5e-7f00-8a00-0000000000c1:Ab3dEf6hIj9kLm2n',
};

beforeEach(() => {
  jest.mocked(printAsync).mockReset().mockResolvedValue(undefined);
  jest.mocked(printToFileAsync).mockReset();
  jest.mocked(shareAsync).mockClear();
  files.clear();
});

describe('the label page', () => {
  test('has the point, the site, a short hint and the code drawn in ink on paper, on an A4 page', () => {
    const html = qrLabelHtml(LABEL);
    expect(html).toContain('<p class="name">Főkapu – sorompó</p>');
    expect(html).toContain('<p class="site">Logisztikai központ, Gyál</p>');
    expect(html).toContain('Waypost ellenőrzőpont – olvasd le a QR-kódot');
    expect(html).toContain(`<path d="${qrDrawing(LABEL.payload).path}" fill="${palette.light.qrInk}"/>`);
    expect(html).toContain('@page { size: A4; margin: 0; }');
    expect(html).toContain('width: 70mm; height: 70mm;');
  });

  test('escapes what the supervisor typed', () => {
    const html = qrLabelHtml({ ...LABEL, name: '<b>Raktár & "rámpa"</b>', site: "O'Brien" });
    expect(html).toContain('<p class="name">&lt;b&gt;Raktár &amp; &quot;rámpa&quot;&lt;/b&gt;</p>');
    expect(html).toContain('<p class="site">O&#39;Brien</p>');
  });

  test('leaves the site out when the phone does not have it', () => {
    expect(qrLabelHtml({ ...LABEL, site: null })).not.toContain('class="site"');
  });
});

test('the file name is the point’s, without the characters a file name cannot have', () => {
  expect(qrLabelFileName('Főkapu – sorompó')).toBe('Főkapu – sorompó – QR-címke.pdf');
  expect(qrLabelFileName('Raktár 1/2: "B" kapu?')).toBe('Raktár 1_2_ _B_ kapu_ – QR-címke.pdf');
  expect(qrLabelFileName('x'.repeat(200))).toHaveLength(80 + '.pdf'.length);
});

describe('printing', () => {
  test('opens the print dialog with the page on A4', async () => {
    await printQrLabel(LABEL);
    expect(printAsync).toHaveBeenCalledWith({ html: qrLabelHtml(LABEL), width: 595, height: 842 });
  });

  test('closing the dialog without printing (iOS) is not an error', async () => {
    jest.mocked(printAsync).mockRejectedValue(Object.assign(new Error('Printing did not complete'), { code: 'ERR_PRINT_INCOMPLETE' }));
    await expect(printQrLabel(LABEL)).resolves.toBeUndefined();
  });

  test('any other failure is', async () => {
    jest.mocked(printAsync).mockRejectedValue(Object.assign(new Error('No printer'), { code: 'ERR_PRINTING_JOB_FAILED' }));
    await expect(printQrLabel(LABEL)).rejects.toThrow('No printer');
  });
});

test('sharing makes a PDF named after the point in the cache and shares it', async () => {
  files.set('file:///cache/Print/0f3a.pdf', { size: 2048, modifiedAtMs: 0 });
  files.set('file:///cache/Főkapu – sorompó – QR-címke.pdf', { size: 1, modifiedAtMs: 0 });
  jest.mocked(printToFileAsync).mockResolvedValue({ uri: 'file:///cache/Print/0f3a.pdf', numberOfPages: 1 });

  await shareQrLabel(LABEL);

  expect(printToFileAsync).toHaveBeenCalledWith({ html: qrLabelHtml(LABEL), width: 595, height: 842 });
  expect([...files.entries()]).toEqual([['file:///cache/Főkapu – sorompó – QR-címke.pdf', { size: 2048, modifiedAtMs: 0 }]]);
  expect(shareAsync).toHaveBeenCalledWith('file:///cache/Főkapu – sorompó – QR-címke.pdf', {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'QR-címke megosztása',
  });
});
