import React from 'react';
import type { ReceiptDraft } from '../../domain/receipt';
import type { ThemeMode } from '../../theme/palettes';

export type ReceiptScannerMode = 'ocr' | 'qr';

export interface ReceiptScannerSheetProps {
  visible: boolean;
  mode: ReceiptScannerMode;
  onClose: () => void;
  onResult: (draft: ReceiptDraft) => void;
  onFallbackManual: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const ReceiptScannerSheet: React.FC<ReceiptScannerSheetProps> = () => {
  return null;
};
