import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { AnimatedModalSheet, BentoSheetHeader, BentoTile } from '../../components/ui';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import type { ReceiptDraft } from '../../domain/receipt';
import { nfceLookupService } from '../../services/nfceLookupService';
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

function formatKeyBlocks(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 44);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
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
  const satHalfRef = useRef<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [activeMode, setActiveMode] = useState<ReceiptScannerMode>(mode);
  const [processing, setProcessing] = useState(false);
  const [scannedLock, setScannedLock] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [sefazEnabled, setSefazEnabled] = useState(true);
  const [pendingKeyDraft, setPendingKeyDraft] = useState<ReceiptDraft | null>(null);

  useEffect(() => {
    if (!visible) {
      setProcessing(false);
      setScannedLock(false);
      setErrorMsg(null);
      setKeyInput('');
      setPendingKeyDraft(null);
      satHalfRef.current = null;
      return;
    }
    setActiveMode(mode);
    void nfceLookupService.isEnabled().then(setSefazEnabled);
  }, [visible, mode]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  if (!visible) return null;

  const handleToggleSefaz = async (next: boolean) => {
    setSefazEnabled(next);
    await nfceLookupService.setEnabled(next);
  };

  const handleResolvedAccessDraft = (draft: ReceiptDraft) => {
    if (draft.duplicateEntryId) {
      setErrorMsg('Esta nota já foi lançada anteriormente.');
      setScannedLock(false);
      return;
    }
    if (draft.amountCents !== null) {
      onResult(draft);
      return;
    }
    setPendingKeyDraft(draft);
    setScannedLock(false);
  };

  const handleProcessImageUri = async (uri: string) => {
    setProcessing(true);
    setErrorMsg(null);
    try {
      const ocrDraft = await receiptService.processReceiptImage(uri);
      if (pendingKeyDraft) {
        const merged: ReceiptDraft = {
          ...pendingKeyDraft,
          amountCents: ocrDraft.amountCents ?? pendingKeyDraft.amountCents,
          dateIso: ocrDraft.dateIso ?? pendingKeyDraft.dateIso,
          description: ocrDraft.description || pendingKeyDraft.description,
          categoryId: pendingKeyDraft.categoryId ?? ocrDraft.categoryId,
          paymentMethod: ocrDraft.paymentMethod ?? pendingKeyDraft.paymentMethod,
          rawLines: ocrDraft.rawLines,
          lowConfidenceFields: ocrDraft.amountCents
            ? ocrDraft.lowConfidenceFields.filter((f) => f !== 'amount')
            : Array.from(new Set([...pendingKeyDraft.lowConfidenceFields, 'amount'])),
        };
        onResult(merged);
        return;
      }

      if (ocrDraft.duplicateEntryId) {
        setErrorMsg('Esta nota já foi lançada anteriormente.');
        return;
      }
      onResult(ocrDraft);
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
        mediaTypes: ['images'],
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
    if (scannedLock || processing || !result?.data || pendingKeyDraft) return;
    const rawData = result.data.trim();

    // CF-e SAT imprime dois códigos de barras Code 128 de 22 dígitos em sequência
    if (/^\d{22}$/.test(rawData)) {
      if (!satHalfRef.current) {
        satHalfRef.current = rawData;
        return;
      }
      if (satHalfRef.current === rawData) return;
      const combined44 = `${satHalfRef.current}${rawData}`;
      satHalfRef.current = null;
      await processCode(combined44);
      return;
    }

    satHalfRef.current = null;
    await processCode(rawData);
  };

  const processCode = async (code: string) => {
    setScannedLock(true);
    setProcessing(true);
    setErrorMsg(null);
    try {
      const draft = await receiptService.processAccessCode(code);
      handleResolvedAccessDraft(draft);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Código não reconhecido como documento fiscal.'
      );
      setScannedLock(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmManualKey = async () => {
    if (processing) return;
    const digits = keyInput.replace(/\D/g, '');
    await processCode(digits);
  };

  const cameraDenied = permission !== null && !permission.granted;
  const keyDigitsCount = keyInput.replace(/\D/g, '').length;

  const headerTitle = pendingKeyDraft
    ? 'Capturar total do cupom'
    : activeMode === 'ocr'
    ? 'Fotografar cupom'
    : activeMode === 'key'
    ? 'Digitar chave de 44 dígitos'
    : 'Ler QR ou código de barras';

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
          title={headerTitle}
          subtitle="Processamento local no aparelho"
          onClose={onClose}
          closeTestID="receipt-scanner-close-btn"
          themeMode={themeMode}
        />

        <View style={styles.body}>
          {!pendingKeyDraft ? (
            <SegmentedControl<ReceiptScannerMode>
              testID="receipt-mode-segmented"
              themeMode={themeMode}
              options={[
                { id: 'qr', label: 'QR / código de barras' },
                { id: 'ocr', label: 'Foto do cupom' },
                { id: 'key', label: 'Digitar chave' },
              ]}
              value={activeMode}
              onChange={(next) => {
                setErrorMsg(null);
                setScannedLock(false);
                setActiveMode(next);
              }}
            />
          ) : (
            <BentoTile variant={tileVariant} title="CHAVE RECONHECIDA">
              <Text style={[styles.infoText, { color: c.text, marginBottom: 4 }]}>
                Agora aponte para o total do cupom
              </Text>
              <Text style={[styles.helperText, { color: c.muted }]}>
                {pendingKeyDraft.description} • Tire uma foto do total ou pule para digitar no formulário.
              </Text>
            </BentoTile>
          )}

          {activeMode === 'key' && !pendingKeyDraft ? (
            <View style={{ gap: space.md }}>
              <BentoTile variant={tileVariant} title="CHAVE DE ACESSO (44 DÍGITOS)">
                <TextInput
                  testID="receipt-key-input"
                  value={keyInput}
                  onChangeText={(txt) => {
                    setErrorMsg(null);
                    setKeyInput(formatKeyBlocks(txt));
                  }}
                  keyboardType="number-pad"
                  placeholder="0000 0000 0000 ..."
                  placeholderTextColor={c.muted}
                  multiline={true}
                  style={[
                    styles.keyInput,
                    { color: c.text, borderColor: c.border, backgroundColor: c.surface },
                  ]}
                />
                <Text style={[styles.helperText, { color: c.muted, marginTop: 6 }]}>
                  {keyDigitsCount}/44 dígitos
                </Text>
              </BentoTile>

              <TouchableOpacity
                testID="receipt-key-confirm-btn"
                style={[styles.primaryBtn, { backgroundColor: c.primary }]}
                onPress={() => void handleConfirmManualKey()}
                disabled={processing}
              >
                <MaterialIcons name="check" size={18} color={c.primaryFg} />
                <Text style={[styles.primaryBtnText, { color: c.primaryFg }]}>
                  Confirmar chave
                </Text>
              </TouchableOpacity>
            </View>
          ) : cameraDenied ? (
            <BentoTile variant={tileVariant} title="CÂMERA BLOQUEADA">
              <Text style={[styles.infoText, { color: c.text }]}>
                Para usar a câmera, libere a permissão nas configurações do aparelho.
              </Text>
              <View style={styles.actionStack}>
                <TouchableOpacity
                  testID="receipt-open-settings-btn"
                  style={[styles.primaryBtn, { backgroundColor: c.primary }]}
                  onPress={() => void Linking.openSettings()}
                >
                  <MaterialIcons name="settings" size={18} color={c.primaryFg} />
                  <Text style={[styles.primaryBtnText, { color: c.primaryFg }]}>
                    Abrir configurações
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="receipt-denied-key-btn"
                  style={[styles.secondaryBtn, { borderColor: c.border }]}
                  onPress={() => setActiveMode('key')}
                >
                  <MaterialIcons name="dialpad" size={18} color={c.text} />
                  <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                    Digitar a chave
                  </Text>
                </TouchableOpacity>
                {activeMode === 'ocr' || pendingKeyDraft ? (
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
                  activeMode === 'qr' && !pendingKeyDraft
                    ? { barcodeTypes: ['qr', 'code128'] }
                    : undefined
                }
                onBarcodeScanned={
                  activeMode === 'qr' && !pendingKeyDraft && !scannedLock
                    ? handleBarcodeScanned
                    : undefined
                }
              />
              {processing ? (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator color={c.primary} size="large" />
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

          {activeMode === 'qr' && !pendingKeyDraft ? (
            <View style={[styles.sefazRow, { borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sefazTitle, { color: c.text }]}>
                  Consultar valor na SEFAZ
                </Text>
                <Text style={[styles.helperText, { color: c.muted }]}>
                  Envia a chave da nota para a SEFAZ do seu estado
                </Text>
              </View>
              <Switch
                testID="receipt-sefaz-switch"
                value={sefazEnabled}
                onValueChange={(val) => void handleToggleSefaz(val)}
              />
            </View>
          ) : null}

          {pendingKeyDraft ? (
            <View style={styles.controlsRow}>
              <TouchableOpacity
                testID="receipt-capture-btn"
                style={[styles.primaryBtn, styles.flexBtn, { backgroundColor: c.primary }]}
                onPress={() => void handleCapturePhoto()}
                disabled={processing}
              >
                <MaterialIcons name="camera-alt" size={18} color={c.primaryFg} />
                <Text style={[styles.primaryBtnText, { color: c.primaryFg }]}>
                  Fotografar total
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="receipt-skip-total-ocr-btn"
                style={[styles.secondaryBtn, styles.flexBtn, { borderColor: c.border }]}
                onPress={() => onResult(pendingKeyDraft)}
              >
                <Text style={[styles.secondaryBtnText, { color: c.text }]}>Pular</Text>
              </TouchableOpacity>
            </View>
          ) : !cameraDenied && activeMode !== 'key' ? (
            <View style={styles.controlsRow}>
              {activeMode === 'ocr' ? (
                <>
                  <TouchableOpacity
                    testID="receipt-capture-btn"
                    style={[styles.primaryBtn, styles.flexBtn, { backgroundColor: c.primary }]}
                    onPress={() => void handleCapturePhoto()}
                    disabled={processing}
                  >
                    <MaterialIcons name="camera-alt" size={18} color={c.primaryFg} />
                    <Text style={[styles.primaryBtnText, { color: c.primaryFg }]}>
                      Fotografar
                    </Text>
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
                <>
                  <TouchableOpacity
                    testID="receipt-open-key-mode-btn"
                    style={[styles.secondaryBtn, styles.flexBtn, { borderColor: c.border }]}
                    onPress={() => setActiveMode('key')}
                  >
                    <MaterialIcons name="dialpad" size={18} color={c.text} />
                    <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                      Digitar a chave
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="receipt-manual-fallback-btn"
                    style={[styles.secondaryBtn, styles.flexBtn, { borderColor: c.border }]}
                    onPress={onFallbackManual}
                  >
                    <MaterialIcons name="edit" size={18} color={c.text} />
                    <Text style={[styles.secondaryBtnText, { color: c.text }]}>
                      Manual
                    </Text>
                  </TouchableOpacity>
                </>
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
    minHeight: 280,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFill,
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
  helperText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  keyInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: space.sm,
    minHeight: 72,
    fontFamily: typography.fontFamily,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  sefazRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  sefazTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    fontWeight: '600',
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
