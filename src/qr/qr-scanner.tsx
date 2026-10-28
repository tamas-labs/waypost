// Camera view that reads QR codes (expo-camera barcode scanning) and reports Waypost codes only.
import { CameraView, type BarcodeScanningResult, type BarcodeSettings } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { createQrScanFilter } from './scan-filter';

const BARCODE_SETTINGS: BarcodeSettings = { barcodeTypes: ['qr'] };

export interface QrScannerProps {
  /** A Waypost code came into view (once per code until it leaves the view). */
  onScan: (payload: string) => void;
  /** Any other QR code came into view; the reader ignores it. */
  onIgnored?: (data: string) => void;
  /** The camera could not start. */
  onError?: (message: string) => void;
  torch?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The camera runs only while the screen is focused: only one camera preview may be active at a time, and a
 * screen under another one must not keep it open.
 */
export function QrScanner({ onScan, onIgnored, onError, torch = false, style }: QrScannerProps) {
  const focused = useIsFocused();
  const [filter] = useState(() => createQrScanFilter());

  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    const scan = filter(data);
    if (scan === null) return;
    if (scan.accepted) onScan(scan.payload);
    else onIgnored?.(scan.data);
  };

  if (!focused) return <View style={style} />;
  return (
    <CameraView
      style={style}
      facing="back"
      barcodeScannerSettings={BARCODE_SETTINGS}
      onBarcodeScanned={handleBarcode}
      onMountError={(event) => onError?.(event.message)}
      enableTorch={torch}
    />
  );
}
