import { act, fireEvent, screen } from '@testing-library/react-native';
import { eq } from 'drizzle-orm';
import { printAsync, printToFileAsync } from 'expo-print';
import { renderRouter } from 'expo-router/testing-library';
import { shareAsync } from 'expo-sharing';

import SupervisorLayout from '@/app/(supervisor)/_layout';
import CheckpointQrScreen from '@/app/(supervisor)/checkpoints/[id]/qr';
import { useSession } from '@/auth/session';
import type { Database } from '@/db/database';
import { getDatabase } from '@/db/open';
import { checkpoints, sites } from '@/db/schema';
import { createTestDatabase } from '@/db/testing';
import { qrDrawing } from '@/qr/code';
import { emitConfigurationPulled, type PullSummary } from '@/sync/events';
import { useSyncStatus } from '@/sync/status';
import { ThemeProvider } from '@/theme/theme-provider';

jest.mock('@/db/open', () => ({ getDatabase: jest.fn() }));
jest.mock('@/sync/runtime', () => ({ requestSync: jest.fn() }));
jest.mock('expo-print', () => ({ printAsync: jest.fn(), printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system');
const { files } = jest.requireMock<typeof import('../__mocks__/expo-file-system')>('expo-file-system');

function RootLayout() {
  const { Stack } = jest.requireActual<typeof import('expo-router')>('expo-router');
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}

const ROUTES = {
  _layout: RootLayout,
  '(supervisor)/_layout': SupervisorLayout,
  '(supervisor)/checkpoints/[id]/qr': CheckpointQrScreen,
};

const AT = '2026-10-27T10:05:12.345Z';
const ME = '019a2b3c-4d5e-7f00-8a00-000000000002';
const SITE = '019a2b3c-4d5e-7f00-8a00-0000000000a1';
const GATE = '019a2b3c-4d5e-7f00-8a00-0000000000c1';
const QR = `waypost:cp:${GATE}:Ab3dEf6hIj9kLm2n`;

let db: Database;

beforeEach(async () => {
  jest.clearAllMocks();
  files.clear();
  ({ db } = await createTestDatabase());
  jest.mocked(getDatabase).mockReturnValue(db);
  useSyncStatus.setState({ online: true, rejectedCalls: [] });
  useSession.setState({ mode: 'supervisor_phone', activeUser: null, deviceId: null, shiftStart: null });
  db.insert(sites)
    .values({
      id: SITE,
      name: 'Raktár',
      timezone: 'Europe/Budapest',
      no_data_alert_after_min: 120,
      created_by: ME,
      created_at: AT,
      updated_at: AT,
    })
    .run();
});

function addGate(values: Partial<typeof checkpoints.$inferInsert> = {}) {
  db.insert(checkpoints)
    .values({
      id: GATE,
      site_id: SITE,
      name: 'Kapu',
      tag_type: 'nfc',
      tag_uid: '04A1B2C3D4E501',
      qr_payload: QR,
      active: true,
      created_at: AT,
      updated_at: AT,
      ...values,
    })
    .run();
}

const open = () => renderRouter(ROUTES, { initialUrl: `/checkpoints/${GATE}/qr` });
const press = (name: string) => act(async () => fireEvent.press(screen.getByRole('button', { name })));

it('shows the point’s code large, dark on light, as a spare for its NFC tag', async () => {
  addGate();
  await open();
  expect(screen.getByText('Kapu')).toBeOnTheScreen();
  expect(screen.getByText('QR-címke · Raktár')).toBeOnTheScreen();
  expect(screen.getByRole('image', { name: 'QR-kód: Kapu' })).toBeOnTheScreen();
  expect(screen.getByText(/Tartalék: ha a pont NFC-címkéje nem olvasható/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Nyomtatás' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Megosztás' })).toBeEnabled();
  expect(screen.queryByText(/ki van kapcsolva/)).toBeNull();

  // The drawing of the payload, the same one the printed label has.
  expect(JSON.stringify(screen.toJSON())).toContain(qrDrawing(QR).path);
});

it('a QR point says the guard scans this code; an inactive one that the scan does not find it', async () => {
  addGate({ tag_type: 'qr', tag_uid: null, active: false });
  await open();
  expect(screen.getByText(/Ezt a kódot olvassa le az őr a ponton/)).toBeOnTheScreen();
  expect(screen.getByText(/A pont ki van kapcsolva/)).toBeOnTheScreen();
});

it('prints the label from the system’s print dialog', async () => {
  addGate();
  await open();
  await press('Nyomtatás');
  expect(printAsync).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('<p class="name">Kapu</p>') }));
});

it('shares the label as a PDF named after the point', async () => {
  addGate();
  files.set('file:///cache/Print/1.pdf', { size: 2048, modifiedAtMs: 0 });
  jest.mocked(printToFileAsync).mockResolvedValue({ uri: 'file:///cache/Print/1.pdf', numberOfPages: 1 });
  await open();
  await press('Megosztás');
  expect(shareAsync).toHaveBeenCalledWith('file:///cache/Kapu – QR-címke.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
});

it('tells when printing fails, and the buttons work again', async () => {
  addGate();
  jest.mocked(printAsync).mockRejectedValueOnce(new Error('Nincs nyomtató'));
  await open();
  await press('Nyomtatás');
  expect(screen.getByText('Nem sikerült: Nincs nyomtató')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Nyomtatás' })).toBeEnabled();
  await press('Nyomtatás');
  expect(screen.queryByText(/Nem sikerült/)).toBeNull();
});

it('waits for the server’s code of a point just trained here, and shows it after the pull', async () => {
  addGate({ qr_payload: null });
  await open();
  expect(screen.getByText(/A pont QR-kódját a szerver adja/)).toBeOnTheScreen();
  expect(screen.queryByRole('image')).toBeNull();
  expect(screen.getByRole('button', { name: 'Nyomtatás' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Megosztás' })).toBeDisabled();

  db.update(checkpoints).set({ qr_payload: QR }).where(eq(checkpoints.id, GATE)).run();
  await act(async () => emitConfigurationPulled({ changed: { checkpoints: 1 } } as unknown as PullSummary));

  expect(screen.getByRole('image', { name: 'QR-kód: Kapu' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Nyomtatás' })).toBeEnabled();
});

it('says so if the phone does not have the point', async () => {
  await open();
  expect(screen.getByText('Ez a pont nincs meg ezen a telefonon.')).toBeOnTheScreen();
});
