import { detectBankIncomeCandidate, type KnownIncomeAsset } from '../income';
import { redactDiagnosticDescription } from '../diagnostics';

describe('Sprint 90 — Proventos por nome do fundo, recibo e redação de diagnóstico (Fase A)', () => {
  it('S90-T01: "RENDIMENTOS - À VISTA s/ FII VINCI SC" com VISC11 ("VINCI SHOPPING CENTERS FII") => VISC11 (D19, R15)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'VISC11', name: 'VINCI SHOPPING CENTERS FII', status: 'ACTIVE' },
      { ticker: 'HGLG11', name: 'CSHG LOGISTICA FII', status: 'ACTIVE' },
    ];

    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-01',
        type: 'CREDIT',
        amount: 45.12,
        date: '2026-11-14T12:00:00Z',
        description: 'RENDIMENTOS - À VISTA s/ FII VINCI SC',
        category: 'Investments',
        categoryId: '03060000',
      },
      knownAssets
    );

    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('VISC11');
    expect(candidate!.kind).toBe('RENDIMENTO');
    expect(candidate!.amount).toBe('45.12');
  });

  it('S90-T02: "s/ FII XP LOG C" com XPLG11 ("XP LOG FII") e XPML11 ("XP MALLS FII") => XPLG11 (D19, R15)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'XPLG11', name: 'XP LOG FII', status: 'ACTIVE' },
      { ticker: 'XPML11', name: 'XP MALLS FII', status: 'ACTIVE' },
    ];

    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-02',
        type: 'CREDIT',
        amount: 88.5,
        date: '2026-11-14T12:00:00Z',
        description: 'RENDIMENTOS - À VISTA s/ FII XP LOG C',
        category: 'Investments',
        categoryId: '03060000',
      },
      knownAssets
    );

    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('XPLG11');
  });

  it('S90-T03: dois ativos compatíveis => null e sinaliza ambiguidade (R15)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'HGLG11', name: 'CSHG LOGISTICA FII', status: 'ACTIVE' },
      { ticker: 'HGRU11', name: 'CSHG RENDA URBANA FII', status: 'ACTIVE' },
    ];

    let ambiguous = 0;
    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-03',
        type: 'CREDIT',
        amount: 50.0,
        date: '2026-11-14T12:00:00Z',
        description: 'RENDIMENTOS - À VISTA s/ FII CSHG',
        category: 'Investments',
        categoryId: '03060000',
      },
      knownAssets,
      { onAmbiguous: () => { ambiguous += 1; } }
    );

    expect(candidate).toBeNull();
    expect(ambiguous).toBe(1);
  });

  it('S90-T04: "RENDIMENTOS DE CLIENTES MXRF11 S/ 637", 60.51 => quantity "637", unitAmount "0.09499215" (D19, R15)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'MXRF11', name: 'MAXI RENDA FII', status: 'ACTIVE' },
    ];

    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-04',
        type: 'CREDIT',
        amount: 60.51,
        date: '2026-11-14T12:00:00Z',
        description: 'RENDIMENTOS DE CLIENTES MXRF11 S/ 637',
        category: 'Proceeds interests and dividends',
        categoryId: '03060000',
      },
      knownAssets
    );

    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('MXRF11');
    expect(candidate!.quantity).toBe('637');
    expect(candidate!.unitAmount).toBe('0.09499215');
  });

  it('S90-T05: mesmo crédito com categoryId 04000000 (Same person transfer) => ainda é provento (D22, R15)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'MXRF11', name: 'MAXI RENDA FII', status: 'ACTIVE' },
    ];

    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-05',
        type: 'CREDIT',
        amount: 60.51,
        date: '2026-02-14T12:00:00Z',
        description: 'RENDIMENTOS DE CLIENTES MXRF11 S/ 637',
        category: 'Same person transfer',
        categoryId: '04000000',
      },
      knownAssets
    );

    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('MXRF11');
    expect(candidate!.amount).toBe('60.51');
    expect(candidate!.quantity).toBe('637');
  });

  it('S90-T06: MXRF13 em TOTAL_WITHDRAWAL e MXRF11 ACTIVE => provento no MXRF11, nota "recibo MXRF13" (D20, R16)', () => {
    const knownAssets: KnownIncomeAsset[] = [
      { ticker: 'MXRF13', name: 'MAXI RENDA FII RECIBO', status: 'TOTAL_WITHDRAWAL' },
      { ticker: 'MXRF11', name: 'MAXI RENDA FII', status: 'ACTIVE' },
    ];

    const candidate = detectBankIncomeCandidate(
      {
        id: 'tx-s90-06',
        type: 'CREDIT',
        amount: 16.8,
        date: '2026-11-14T12:00:00Z',
        description: 'RENDIMENTOS DE CLIENTES MXRF13 S/ 168',
        category: 'Investments',
        categoryId: '03060000',
      },
      knownAssets
    );

    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('MXRF11');
    expect(candidate!.notes).toContain('recibo MXRF13');
    expect(candidate!.quantity).toBe('168');
    expect(candidate!.unitAmount).toBe('0.10000000');
  });

  it('S90-T08: redactDiagnosticDescription mascara nomes, contas e CPF/CNPJ preservando datas e tickers (D25, R21)', () => {
    const pix = redactDiagnosticDescription('Pix enviado para Pedro Gabriel de Sou…', {
      categoryId: '04000000',
      ownerNames: ['PEDRO GABRIEL DE SOUSA'],
    });
    expect(pix.toLowerCase()).not.toContain('pedro');
    expect(pix.toLowerCase()).not.toContain('gabriel');
    expect(pix).toContain('<contraparte>');

    const ted = redactDiagnosticDescription('TED BCO 348 AGE 1 CTA 14459415 - RETI…', {
      categoryId: '04000000',
      ownerNames: ['PEDRO GABRIEL DE SOUSA'],
    });
    expect(ted).not.toContain('14459415');
    expect(ted).toContain('####');

    const rendimento = redactDiagnosticDescription('RENDIMENTOS DE CLIENTES MXRF11 S/ 637', {
      categoryId: '03060000',
      ownerNames: ['PEDRO GABRIEL DE SOUSA'],
    });
    expect(rendimento).toBe('RENDIMENTOS DE CLIENTES MXRF11 S/ 637');

    const pregao = redactDiagnosticDescription('…PREGÃO: 06/11/2026', {
      categoryId: '03000000',
      ownerNames: ['PEDRO GABRIEL DE SOUSA'],
    });
    expect(pregao).toContain('06/11/2026');
  });
});
