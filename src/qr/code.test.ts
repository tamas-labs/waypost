import { create } from 'qrcode';

import { QR_QUIET_ZONE, qrDrawing, qrSvgMarkup } from './code';

const PAYLOAD = 'waypost:cp:019a2b3c-4d5e-7f00-8a00-0000000000c1:Ab3dEf6hIj9kLm2n';

/** The dark modules the path draws, as "row,col" of the code without its quiet zone. */
function drawnModules(path: string): Set<string> {
  const dark = new Set<string>();
  for (const [, x, y, run] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    for (let i = 0; i < Number(run); i += 1) dark.add(`${Number(y) - QR_QUIET_ZONE},${Number(x) - QR_QUIET_ZONE + i}`);
  }
  return dark;
}

test('a checkpoint code is version 6 at error correction Q, with the quiet zone around it', () => {
  const drawing = qrDrawing(PAYLOAD);
  expect(drawing.size).toBe(41 + 2 * QR_QUIET_ZONE);
});

test('the path draws exactly the dark modules of the code, nothing more, in rectangles that do not overlap', () => {
  const { modules } = create(PAYLOAD, { errorCorrectionLevel: 'Q' });
  const drawing = qrDrawing(PAYLOAD);
  const expected = new Set<string>();
  for (let row = 0; row < modules.size; row += 1)
    for (let col = 0; col < modules.size; col += 1) if (modules.get(row, col)) expected.add(`${row},${col}`);
  expect(drawnModules(drawing.path)).toEqual(expected);
  expect(drawing.path.replace(/M\d+ \d+h(\d+)v1h-\1z/g, '')).toBe('');
});

test('the finder pattern starts after the quiet zone: a run of seven at the top left', () => {
  expect(qrDrawing(PAYLOAD).path.startsWith(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h7v1h-7z`)).toBe(true);
});

test('the SVG markup fills its box with the paper colour and draws the path in ink', () => {
  const drawing = qrDrawing(PAYLOAD);
  const markup = qrSvgMarkup(drawing, { ink: '#000000', paper: '#FFFFFF' });
  expect(markup).toContain(`viewBox="0 0 ${drawing.size} ${drawing.size}"`);
  expect(markup).toContain(`<rect width="${drawing.size}" height="${drawing.size}" fill="#FFFFFF"/>`);
  expect(markup).toContain(`<path d="${drawing.path}" fill="#000000"/>`);
});
