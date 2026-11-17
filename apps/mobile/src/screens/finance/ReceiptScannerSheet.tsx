import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { AnimatedModalSheet, BentoSheetHeader, BentoTile } from '../../components/ui';
import type { ReceiptDraft } from '../../domain/receipt';
import { receiptService } from '../../services/receiptService';
import { space, typography } from '../../theme/tokens';
import type { ThemeMode } from '../../theme/palettes';
import { getFinUiColors } from './finTheme';

export type ReceiptScannerMode = 'ocr' | 'qr' | 'key';

export interface ReceiptScannerSheetProps {
  visible: boolean;
  mode: ReceiptScannerMode;
  onClose: () => void;
  onResult: (draft: ReceiptDraft) => void;
  onFallbackManual: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const ReceiptScannerSheet: React.FC<ReceiptScannerSheetProps> = ({
  visible,
  mode,
  onClose,
  onResult,
  onFallbackManual,
  themeMode = 'dark',
  testID = 'receipt-scanner-sheet',
}) => {
  const c = getFinUiColors(themeMode);
  const tileVariant = c.isLight ? 'light' : 'dark';
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scannedLock, setScannedLock] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setProcessing(false);
      setScannedLock(false);
      setErrorMsg(null);
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  if (!visible) return null;

  const handleProcessImageUri = async (uri: string) => {
    setProcessing(true);
    setErrorMsg(null);
    try {
      const draft = await receiptService.processReceiptImage(uri);
      onResult(draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Não foi possível ler o cupom.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCapturePhoto = async () => {
    if (processing) return;
    setErrorMsg(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        await handleProcessImageUri(photo.uri);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao capturar foto.');
    }
  };

  const handlePickGallery = async () => {
    if (processing) return;
    setErrorMsg(null);
    try {
      const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaPerm.granted) {
        setErrorMsg('Permissão à galeria negada.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!picked.canceled && picked.assets?.[0]?.uri) {
        await handleProcessImageUri(picked.assets[0].uri);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao abrir a galeria.');
    }
  };

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (scannedLock || processing || !result?.data) return;
    setScannedLock(true);
    setProcessing(true);
    setErrorMsg(null);
    try {
      const draft = await receiptService.processNfceQr(result.data);
      if (draft.duplicateEntryId) {
        setErrorMsg('Esta NFC-e já foi lançada anteriormente.');
        setScannedLock(false);
        return;
      }
      onResult(draft);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'QR code não reconhecido como NFC-e.');
      setScannedLock(false);
    } finally {
      setProcessing(false);
    }
  };

  const cameraDenied = permission !== null && !permission.granted;

  return (
    <AnimatedModalSheet
      visible={visible}
      onClose={onClose}
      themeMode={themeMode}
      showHandle={true}
      fill={true}
      testID={testID}
    >
      <View style={styles.container}>
        <BentoSheetHeader
          title={mode === 'ocr' ? 'Fotografar cupom' : 'Ler QR da NFC-e'}
          subtitle="Processamento 100% local no aparelho"
          onClose={onClose}
          closeTestID="receipt-scanner-close-btn"
          themeMode={themeMode}
        />

        <View style={styles.body}>
          {cameraDenied ? (
            <BentoTile variant={tileVariant} title="CÂMERA BLOQUEADA">
              <Text style={[styles.infoText, { color: c.text }]}>
                Para usar a câmera, libere a permissão nas configurações do aparelho.
              </Text>
              <View style={styles.actionStack}>
                <TouchableOpacity
                  testID="receipt-open-settings-btn"
                  style={[styles.primaryBtn, { backgroundColor: c.accent }]}
                  onPress={() => void Linking.openSettings()}
                >
                  <MaterialIcons name="settings" size={18} color="#0C0F0D" />
                  <Text style={styles.primaryBtnText}>Abrir configurações</Text>
                </TouchableOpacity>
                {mode === 'ocr' ? (
                  <TouchableOpacity
                    testID="receipt-gallery-btn"
                    style={[styles.secondaryBtn, { borderColor: c.border }]}
                    onPress={() => void handlePickGallery()}
                  >
                    <MaterialIcons name="photo-library" size={18} color={c.text} />
                    <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                      Escolher da galeria
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  testID="receipt-manual-fallback-btn"
                  style={[styles.secondaryBtn, { borderColor: c.border }]}
                  onPress={onFallbackManual}
                >
                  <MaterialIcons name="edit" size={18} color={c.text} />
                  <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                    Lançar manualmente
                  </Text>
                </TouchableOpacity>
              </View>
            </BentoTile>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView
                ref={cameraRef}
                testID="expo-camera-view"
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={
                  mode === 'qr' ? { barcodeTypes: ['qr'] } : undefined
                }
                onBarcodeScanned={mode === 'qr' && !scannedLock ? handleBarcodeScanned : undefined}
              />
              {processing ? (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator color={c.accent} size="large" />
                  <Text style={styles.processingText}>Lendo dados no aparelho...</Text>
                </View>
              ) : null}
            </View>
          )}

          {errorMsg ? (
            <Text testID="receipt-scanner-error" style={[styles.errorText, { color: c.overdue }]}>
              {errorMsg}
            </Text>
          ) : null}

          {!cameraDenied ? (
            <View style={styles.controlsRow}>
              {mode === 'ocr' ? (
                <>
                  <TouchableOpacity
                    testID="receipt-capture-btn"
                    style={[styles.primaryBtn, styles.flexBtn, { backgroundColor: c.accent }]}
                    onPress={() => void handleCapturePhoto()}
                    disabled={processing}
                  >
                    <MaterialIcons name="camera-alt" size={18} color="#0C0F0D" />
                    <Text style={styles.primaryBtnText}>Fotografar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="receipt-gallery-btn"
                    style={[styles.secondaryBtn, styles.flexBtn, { borderColor: c.border }]}
                    onPress={() => void handlePickGallery()}
                    disabled={processing}
                  >
                    <MaterialIcons name="photo-library" size={18} color={c.text} />
                    <Text style={[styles.secondaryBtnText, { color: c.text }]}>Galeria</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  testID="receipt-manual-fallback-btn"
                  style={[styles.secondaryBtn, styles.flexBtn, { borderColor: c.border }]}
                  onPress={onFallbackManual}
                >
                  <MaterialIcons name="edit" size={18} color={c.text} />
                  <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                    Lançar manualmente
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedModalSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.md,
  },
  cameraWrapper: {
    flex: 1,
    minHeight: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  processingText: {
    color: '#FFFFFF',
    fontFamily: typography.fontFamily,
    fontSize: 13,
  },
  infoText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: space.md,
  },
  actionStack: {
    gap: space.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  flexBtn: {
    flex: 1,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  primaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: '#0C0F0D',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
  },
  secondaryBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    textAlign: 'center',
  },
});
