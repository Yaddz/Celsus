import { AssetClass } from '../../components/ui/AttributeStatBar';

export interface AssetValidationResult {
  valid: boolean;
  detectedClass?: AssetClass;
  reason?: string;
}

const KNOWN_STOCK_UNITS = new Set([
  'ALUP11',
  'SANB11',
  'TAEE11',
  'KLBN11',
  'BPAC11',
  'SAPR11',
  'SULA11',
  'ENGI11',
]);

const KNOWN_FIIS = new Set([
  'HGLG11',
  'MXRF11',
  'BTLG11',
  'KNRI11',
  'XPML11',
  'VISC11',
  'XPLG11',
  'TGAR11',
  'VGIR11',
  'CPTS11',
  'KNCR11',
  'HGCR11',
  'VRTA11',
  'HGRU11',
  'BCFF11',
  'BRCR11',
  'VILG11',
  'JSRE11',
  'RBRR11',
  'IRDM11',
  'RECR11',
  'VINO11',
  'MCCI11',
  'TRXF11',
  'KNSC11',
]);

const KNOWN_CRYPTOS = new Set([
  'BTC',
  'ETH',
  'SOL',
  'USDT',
  'USDC',
  'BNB',
  'ADA',
  'DOT',
  'AVAX',
  'LINK',
  'MATIC',
  'XRP',
  'DOGE',
]);

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  STOCK: 'Ações',
  FII: 'Fundos Imobiliários (FII)',
  FIXED_INCOME: 'Renda Fixa',
  CRYPTO: 'Criptomoedas',
};

export function detectAssetClassFromTicker(ticker: string): AssetClass | null {
  if (!ticker) return null;
  const clean = ticker.trim().toUpperCase();

  // 1. Criptomoedas
  if (KNOWN_CRYPTOS.has(clean)) {
    return 'CRYPTO';
  }

  // 2. Renda Fixa (prefixos / palavras-chave comuns)
  if (
    clean.startsWith('CDB') ||
    clean.startsWith('LCI') ||
    clean.startsWith('LCA') ||
    clean.startsWith('CRI') ||
    clean.startsWith('CRA') ||
    clean.startsWith('TESOURO') ||
    clean.startsWith('DEB') ||
    clean.includes('CDI') ||
    clean.includes('IPCA') ||
    clean.includes('SELIC') ||
    clean.includes('PREFIXADO')
  ) {
    return 'FIXED_INCOME';
  }

  // 3. Known FIIs
  if (KNOWN_FIIS.has(clean)) {
    return 'FII';
  }

  // 4. Units de Ações terminadas em 11
  if (KNOWN_STOCK_UNITS.has(clean)) {
    return 'STOCK';
  }

  // 5. Tickers B3 terminados em 11 (por padrão FII se não for Unit conhecida)
  if (/^[A-Z]{4}11$/.test(clean)) {
    return 'FII';
  }

  // 6. Ações B3 comuns: terminadas em 3 (ON), 4 (PN), 5 (PNA), 6 (PNB), 33 (BDR)
  if (/^[A-Z]{4}(3|4|5|6|33)$/.test(clean)) {
    return 'STOCK';
  }

  return null;
}

export function validateTickerForAssetClass(
  ticker: string,
  selectedClass: AssetClass
): AssetValidationResult {
  if (!ticker || !ticker.trim()) {
    return {
      valid: false,
      reason: 'Informe o código do ativo (ticker).',
    };
  }

  const clean = ticker.trim().toUpperCase();
  const detected = detectAssetClassFromTicker(clean);

  if (!detected) {
    // Se não detectado por heurística, permite cadastrar na classe selecionada
    return { valid: true };
  }

  if (detected !== selectedClass) {
    const detectedLabel = ASSET_CLASS_LABELS[detected] || detected;
    const targetLabel = ASSET_CLASS_LABELS[selectedClass] || selectedClass;

    return {
      valid: false,
      detectedClass: detected,
      reason: `${clean} é um ativo de ${detectedLabel} e não pode ser cadastrado na categoria ${targetLabel}.`,
    };
  }

  return {
    valid: true,
    detectedClass: detected,
  };
}
