import { resetDatabase } from '../../db/client';
import {
  ACCESS_KEY_S75_FIXTURES,
  RECEIPT_S75_FIXTURES,
} from '../../domain/receipt/__tests__/fixtures';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../finService';
import { nfceLookupService } from '../nfceLookupService';
import { receiptService } from '../receiptService';

describe('Sprint 75 — Fluxos de leitura de cupom, chave por foto e SEFAZ (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-16');
    jest.restoreAllMocks();
  });

  test('S75-T06: processAccessCode aceita URL de QR e chave pura (modelo 55, 59 ou 65) e detecta duplicidade', async () => {
    const draft55 = await receiptService.processAccessCode(ACCESS_KEY_S75_FIXTURES.nfe55);
    expect(draft55.externalId).toBe(ACCESS_KEY_S75_FIXTURES.nfe55);
    expect(draft55.cnpj).toBe('47508411000156');
    expect(draft55.amountCents).toBeNull();
    expect(draft55.duplicateEntryId).toBeNull();

    const draft59 = await receiptService.processAccessCode(ACCESS_KEY_S75_FIXTURES.sat59);
    expect(draft59.externalId).toBe(ACCESS_KEY_S75_FIXTURES.sat59);

    const accounts = await finRepository.listAccounts(false);
    const categories = await finRepository.listCategories(false);
    const created = await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 31000,
      due_date: '2026-11-16',
      account_id: accounts[0].id,
      category_id: categories[0].id,
      description: 'DANFE',
      external_id: ACCESS_KEY_S75_FIXTURES.nfe55,
      source: 'OCR',
    });

    const dup = await receiptService.processAccessCode(ACCESS_KEY_S75_FIXTURES.nfe55);
    expect(dup.duplicateEntryId).toBe(created.id);
  });

  test('S75-T07: processReceiptImage extrai chave de 44 dígitos quebrada em 3 linhas e preenche externalId e rawLines', async () => {
    const textExtractor = require('expo-text-extractor');
    jest
      .spyOn(textExtractor, 'extractTextFromImage')
      .mockResolvedValueOnce(RECEIPT_S75_FIXTURES.chaveQuebrada3Linhas);

    const draft = await receiptService.processReceiptImage('file://cupom.jpg');
    expect(draft.amountCents).toBe(19990);
    expect(draft.externalId).toBe(ACCESS_KEY_S75_FIXTURES.nfce65Df);
    expect(draft.rawLines).toEqual(RECEIPT_S75_FIXTURES.chaveQuebrada3Linhas);
  });

  test('S75-T08: nfceLookupService é ligado por padrão, extrai total do HTML do DF e respeita preferência desligada sem chamar fetch', async () => {
    expect(await nfceLookupService.isEnabled()).toBe(true);

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><body><div>Valor a pagar R$: <strong>147,80</strong></div></body></html>',
    });
    (global as any).fetch = fetchSpy;

    const resDf = await nfceLookupService.fetchNfceTotal(ACCESS_KEY_S75_FIXTURES.dfOnlineQr);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(resDf.uf).toBe('DF');
    expect(resDf.amountCents).toBe(14780);

    await nfceLookupService.setEnabled(false);
    expect(await nfceLookupService.isEnabled()).toBe(false);

    fetchSpy.mockClear();
    const draftOff = await receiptService.processAccessCode(ACCESS_KEY_S75_FIXTURES.dfOnlineQr);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(draftOff.amountCents).toBeNull();
  });
});
