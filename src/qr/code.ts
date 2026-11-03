// The QR code of a checkpoint as a drawing: one SVG path for its dark modules, drawn the same way on the screen
// (react-native-svg) and on the printed label (expo-print's HTML), so what is printed is what the screen shows.
import { create } from 'qrcode';

/** The empty border the standard asks for around the code, in modules: without it a reader may not find the code. */
export const QR_QUIET_ZONE = 4;

export interface QrDrawing {
  /** The width and height in modules, with the quiet zone: the viewBox is 0 0 size size. */
  size: number;
  /** The dark modules, a row's adjacent ones as one rectangle. */
  path: string;
}

/**
 * The drawing of a payload. Error correction "Q" (25%): a label on a wall gets scratched, dirty and wet, and the
 * checkpoint codes are short enough (about 64 characters) for it to stay a version 6 code (41 modules).
 */
export function qrDrawing(payload: string): QrDrawing {
  const { modules } = create(payload, { errorCorrectionLevel: 'Q' });
  const parts: string[] = [];
  for (let row = 0; row < modules.size; row += 1) {
    let col = 0;
    while (col < modules.size) {
      if (!modules.get(row, col)) {
        col += 1;
        continue;
      }
      const start = col;
      while (col < modules.size && modules.get(row, col)) col += 1;
      parts.push(`M${start + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h${col - start}v1h-${col - start}z`);
    }
  }
  return { size: modules.size + 2 * QR_QUIET_ZONE, path: parts.join('') };
}

/** The drawing as an SVG element for HTML, filling its box: the quiet zone in the paper colour, the modules in ink. */
export function qrSvgMarkup(drawing: QrDrawing, colors: { ink: string; paper: string }): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.size} ${drawing.size}" shape-rendering="crispEdges">` +
    `<rect width="${drawing.size}" height="${drawing.size}" fill="${colors.paper}"/>` +
    `<path d="${drawing.path}" fill="${colors.ink}"/></svg>`
  );
}
