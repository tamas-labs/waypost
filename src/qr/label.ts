// The printed QR label of a checkpoint (specification: (supervisor)/checkpoints/[id]/qr, expo-print): an A4 page with
// one label to cut out – the point's name, the site, the code 70 mm wide –, printed from the system's print dialog or
// shared as a PDF (to e-mail it, or print it from another device). Black on white whatever the theme: it is paper.
import { File, Paths } from 'expo-file-system';
import { printAsync, printToFileAsync } from 'expo-print';
import { shareAsync } from 'expo-sharing';

import { t } from '@/i18n';
import { palette } from '@/theme/tokens';

import { qrDrawing, qrSvgMarkup } from './code';

export interface QrLabel {
  name: string;
  site: string | null;
  payload: string;
}

/** A4 in the units of expo-print (72 per inch). */
const A4 = { width: 595, height: 842 } as const;

/** What iOS rejects with when the print dialog is closed without printing (expo-print: PrintIncompleteException). */
const PRINT_CANCELLED = 'ERR_PRINT_INCOMPLETE';

const FILE_NAME_MAX = 80;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The page of the label. The texts are escaped: a point's name is the supervisor's free text. */
export function qrLabelHtml(label: QrLabel): string {
  const ink = palette.light;
  const code = qrSvgMarkup(qrDrawing(label.payload), { ink: ink.qrInk, paper: ink.qrPaper });
  const site = label.site === null ? '' : `<p class="site">${escapeHtml(label.site)}</p>`;
  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: ${ink.qrPaper}; color: ${ink.text}; }
body { font-family: Manrope, 'Helvetica Neue', Roboto, Arial, sans-serif; }
.label { box-sizing: border-box; width: 90mm; margin: 20mm auto 0; padding: 8mm 8mm 6mm; text-align: center;
  border: 0.3mm dashed ${ink.dash}; border-radius: 4mm; page-break-inside: avoid; }
.name { margin: 0; font-size: 6mm; line-height: 1.25; font-weight: 800; overflow-wrap: anywhere; }
.site { margin: 1.5mm 0 0; font-size: 4mm; font-weight: 600; color: ${ink.text2}; overflow-wrap: anywhere; }
.code { width: 70mm; height: 70mm; margin: 5mm auto 0; }
.code svg { display: block; width: 100%; height: 100%; }
.hint { margin: 4mm 0 0; font-size: 3mm; font-weight: 600; color: ${ink.text2}; }
</style>
</head>
<body>
<div class="label">
<p class="name">${escapeHtml(label.name)}</p>
${site}
<div class="code">${code}</div>
<p class="hint">${escapeHtml(t('qrLabel.printHint'))}</p>
</div>
</body>
</html>`;
}

/** The name of the shared PDF: the point's name, without the characters a file name cannot have. */
export function qrLabelFileName(name: string): string {
  const base = t('qrLabel.fileName', { name })
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, FILE_NAME_MAX);
  return `${base}.pdf`;
}

/** Opens the system's print dialog with the label. Closing it without printing is not an error. */
export async function printQrLabel(label: QrLabel): Promise<void> {
  try {
    await printAsync({ html: qrLabelHtml(label), ...A4 });
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === PRINT_CANCELLED) return;
    throw error;
  }
}

/** Makes the label a PDF in the cache, named after the point, and opens the share sheet with it. */
export async function shareQrLabel(label: QrLabel): Promise<void> {
  const { uri } = await printToFileAsync({ html: qrLabelHtml(label), ...A4 });
  const file = new File(uri);
  file.moveSync(new File(Paths.cache, qrLabelFileName(label.name)), { overwrite: true });
  await shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: t('qrLabel.shareTitle') });
}
