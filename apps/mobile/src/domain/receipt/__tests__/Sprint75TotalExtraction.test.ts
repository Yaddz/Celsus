import { parseReceiptText } from '../index';
import { RECEIPT_S75_FIXTURES } from './fixtures';

describe('Sprint 75 — Extração de total por pontuação e chave em OCR (Fase A)', () => {
  test('S75-T03: extrai total em leitura em colunas (rótulos primeiro, valores depois) com confiança alta quando há confirmação', () => {
    const mercado = parseReceiptText(RECEIPT_S75_FIXTURES.colunasMercado);
    expect(mercado.totalCents.value).toBe(12840);
    expect(mercado.totalCents.confidence).toBe('alta');

    const farmacia = parseReceiptText(RECEIPT_S75_FIXTURES.colunasFarmacia);
    expect(farmacia.totalCents.value).toBe(8000);
    expect(farmacia.totalCents.confidence).toBe('alta');
  });

  test('S75-T04: calcula total = pago - troco quando há TROCO e usa VALOR PAGO + forma de pagamento como confirmação', () => {
    const troco = parseReceiptText(RECEIPT_S75_FIXTURES.comTroco);
    expect(troco.totalCents.value).toBe(2500);
    expect(troco.totalCents.confidence).toBe('alta');

    const valorPago = parseReceiptText(RECEIPT_S75_FIXTURES.apenasValorPago);
    expect(valorPago.totalCents.value).toBe(4250);
    expect(valorPago.totalCents.confidence).toBe('alta');
  });

  test('S75-T05: extrai total corretamente em cupom com desconto, SAT, NF-e 55 e chave quebrada em 3 linhas', () => {
    expect(parseReceiptText(RECEIPT_S75_FIXTURES.comDesconto).totalCents.value).toBe(8500);
    expect(parseReceiptText(RECEIPT_S75_FIXTURES.cfeSat59).totalCents.value).toBe(6390);
    expect(parseReceiptText(RECEIPT_S75_FIXTURES.danfeNfe55).totalCents.value).toBe(31000);
    expect(parseReceiptText(RECEIPT_S75_FIXTURES.chaveQuebrada3Linhas).totalCents.value).toBe(19990);
  });
});
