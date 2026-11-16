import {
  isValidAccessKeyMod11,
  isValidCnpj,
  parseNfceQr,
  parseReceiptText,
  suggestCategoryFromRules,
} from '../index';
import type { CategoryRuleCandidate } from '../types';
import { NFCE_QR_FIXTURES, RECEIPT_FIXTURES } from './fixtures';

describe('parseReceiptText — extração on-device de cupons fiscais', () => {
  it('1. extrai total, data, hora, CNPJ, estabelecimento e PIX do supermercado', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.supermercadoPaoDeAcucar);
    expect(res.totalCents).toEqual({ value: 18745, confidence: 'alta' });
    expect(res.dateIso).toEqual({ value: '2026-11-14', confidence: 'alta' });
    expect(res.time.value).toBe('18:42:10');
    expect(res.time.confidence).toBe('alta');
    expect(res.cnpj).toEqual({ value: '47508411000156', confidence: 'alta' });
    expect(res.merchantName.value).toContain('COMPANHIA BRASILEIRA');
    expect(res.merchantName.confidence).toBe('alta');
    expect(res.paymentMethod).toEqual({ value: 'PIX', confidence: 'alta' });
  });

  it('2. prioriza VALOR A PAGAR e ignora desconto, troco e tributos na farmácia', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.farmaciaDrogasil);
    expect(res.totalCents).toEqual({ value: 6490, confidence: 'alta' });
    expect(res.dateIso).toEqual({ value: '2026-11-15', confidence: 'alta' });
    expect(res.time.value).toBe('09:15:33');
    expect(res.cnpj).toEqual({ value: '61585865000151', confidence: 'alta' });
    expect(res.paymentMethod).toEqual({ value: 'CREDITO', confidence: 'alta' });
  });

  it('3. extrai TOTAL R$ e débito do posto de combustível', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.postoCombustivel);
    expect(res.totalCents).toEqual({ value: 25000, confidence: 'alta' });
    expect(res.dateIso).toEqual({ value: '2026-11-10', confidence: 'alta' });
    expect(res.time.value).toBe('14:22');
    expect(res.cnpj).toEqual({ value: '10456789000143', confidence: 'alta' });
    expect(res.merchantName.value).toContain('AUTO POSTO ESTRELA');
    expect(res.paymentMethod).toEqual({ value: 'DEBITO', confidence: 'alta' });
  });

  it('4. aceita valores com ponto decimal e ignora troco no restaurante', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.restaurantePontoDecimal);
    expect(res.totalCents).toEqual({ value: 14280, confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '17261661000173', confidence: 'alta' });
    expect(res.paymentMethod).toEqual({ value: 'DINHEIRO', confidence: 'alta' });
  });

  it('5. lida com cupom amassado e linhas quebradas para total, CNPJ e pagamento', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.cupomAmassadoQuebrado);
    expect(res.totalCents.value).toBe(8930);
    expect(['alta', 'baixa']).toContain(res.totalCents.confidence);
    expect(res.dateIso.value).toBe('2026-11-08');
    expect(res.time.value).toBe('17:31');
    expect(res.cnpj.value).toBe('03476811000151');
    expect(res.paymentMethod.value).toBe('DEBITO');
  });

  it('6. reconhece TOTAL A PAGAR e Vale Alimentação na padaria', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.padariaValeAlimentacao);
    expect(res.totalCents).toEqual({ value: 2850, confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '22334455000186', confidence: 'alta' });
    expect(res.paymentMethod).toEqual({ value: 'VALE', confidence: 'alta' });
  });

  it('7. interpreta separador de milhar brasileiro (1.245,90) e ignora desconto/tributos', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.atacarejoMilhar);
    expect(res.totalCents).toEqual({ value: 124590, confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '06057223000171', confidence: 'alta' });
    expect(res.paymentMethod).toEqual({ value: 'PIX', confidence: 'alta' });
  });

  it('8. interpreta formato americano (1,299.00) e data ISO', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.varejoFormatoPonto);
    expect(res.totalCents).toEqual({ value: 129900, confidence: 'alta' });
    expect(res.dateIso).toEqual({ value: '2026-11-03', confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '33041260000164', confidence: 'alta' });
  });

  it('9. marca campos ausentes quando CNPJ e hora não existem no cupom', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.mercadoSemCnpj);
    expect(res.totalCents).toEqual({ value: 4200, confidence: 'alta' });
    expect(res.merchantName.value).toContain('MERCEARIA');
    expect(res.cnpj).toEqual({ value: null, confidence: 'ausente' });
    expect(res.time).toEqual({ value: null, confidence: 'ausente' });
  });

  it('10. rejeita CNPJ com dígito verificador inválido', () => {
    expect(isValidCnpj('47508411000199')).toBe(false);
    expect(isValidCnpj('47.508.411/0001-56')).toBe(true);
    const res = parseReceiptText(RECEIPT_FIXTURES.cupomCnpjInvalido);
    expect(res.cnpj).toEqual({ value: null, confidence: 'ausente' });
  });

  it('11. cupom ilegível sem total devolve total ausente (nunca zero)', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.cupomIlegivelSemTotal);
    expect(res.totalCents).toEqual({ value: null, confidence: 'ausente' });
    expect(res.dateIso).toEqual({ value: null, confidence: 'ausente' });
    expect(res.cnpj).toEqual({ value: null, confidence: 'ausente' });
  });

  it('12. suporta ano com 2 dígitos (DD/MM/YY) e prioriza VALOR TOTAL sobre VALOR PAGO e TROCO', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.estacionamentoAnoCurto);
    expect(res.totalCents).toEqual({ value: 1800, confidence: 'alta' });
    expect(res.dateIso.value).toBe('2026-11-15');
    expect(res.paymentMethod.value).toBe('DINHEIRO');
  });

  it('13. pula cabeçalhos genéricos (DANFE NFC-e / DOCUMENTO AUXILIAR) ao extrair estabelecimento', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.petshopComCabecalho);
    expect(res.merchantName.value).toContain('PETZ COMERCIO');
    expect(res.totalCents).toEqual({ value: 15990, confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '18362951000176', confidence: 'alta' });
  });

  it('14. ignora SUBTOTAL, DESCONTO e TRIB APROX quando VALOR TOTAL está presente', () => {
    const res = parseReceiptText(RECEIPT_FIXTURES.papelariaTributos);
    expect(res.totalCents).toEqual({ value: 5000, confidence: 'alta' });
    expect(res.cnpj).toEqual({ value: '44556677000186', confidence: 'alta' });
  });
});

describe('parseNfceQr — validação módulo 11 e extração da chave NFC-e', () => {
  it('valida chave de 44 dígitos pelo módulo 11', () => {
    expect(isValidAccessKeyMod11('35261147508411000156650010001234561876543218')).toBe(true);
    expect(isValidAccessKeyMod11('35261147508411000156650010001234561876543219')).toBe(false);
    expect(isValidAccessKeyMod11('12345')).toBe(false);
  });

  it('decodifica QR v2 online de SP sem valor total', () => {
    const qr = parseNfceQr(NFCE_QR_FIXTURES.validSpOnline);
    expect(qr.valid).toBe(true);
    expect(qr.accessKey).toBe('35261147508411000156650010001234561876543218');
    expect(qr.ufCode).toBe('35');
    expect(qr.uf).toBe('SP');
    expect(qr.aamm).toBe('2611');
    expect(qr.cnpj).toBe('47508411000156');
    expect(qr.model).toBe('65');
    expect(qr.amountCents).toBeNull();
  });

  it('decodifica QR v2 offline do RJ extraindo vNF em centavos', () => {
    const qr = parseNfceQr(NFCE_QR_FIXTURES.validRjOfflineWithTotal);
    expect(qr.valid).toBe(true);
    expect(qr.uf).toBe('RJ');
    expect(qr.aamm).toBe('2610');
    expect(qr.cnpj).toBe('61585865000151');
    expect(qr.model).toBe('65');
    expect(qr.amountCents).toBe(15490);
  });

  it('decodifica QR v1 de MG com chNFe e vNF', () => {
    const qr = parseNfceQr(NFCE_QR_FIXTURES.validMgV1WithTotal);
    expect(qr.valid).toBe(true);
    expect(qr.uf).toBe('MG');
    expect(qr.model).toBe('65');
    expect(qr.amountCents).toBe(25000);
  });

  it('rejeita QR com dígito verificador inválido', () => {
    const qr = parseNfceQr(NFCE_QR_FIXTURES.invalidDv);
    expect(qr.valid).toBe(false);
    expect(qr.accessKey).toBeNull();
  });

  it('rejeita chave cujo modelo não é 65 (ex: NF-e modelo 55)', () => {
    const qr = parseNfceQr(NFCE_QR_FIXTURES.wrongModel55);
    expect(qr.valid).toBe(false);
    expect(qr.model).toBe('55');
  });

  it('rejeita chave com menos de 44 dígitos e URL comum', () => {
    expect(parseNfceQr(NFCE_QR_FIXTURES.shortKey).valid).toBe(false);
    expect(parseNfceQr(NFCE_QR_FIXTURES.randomUrl).valid).toBe(false);
  });
});

describe('suggestCategoryFromRules — sugestão por fin_category_rules', () => {
  const rules: CategoryRuleCandidate[] = [
    { id: 'r1', match_type: 'contains', pattern: 'drogasil', category_id: 'cat-saude' },
    { id: 'r2', match_type: 'starts_with', pattern: 'pao de acucar', category_id: 'cat-mercado' },
    { id: 'r3', match_type: 'exact', pattern: '47508411000156', category_id: 'cat-mercado-cnpj' },
    { id: 'r4', match_type: 'contains', pattern: 'posto', category_id: 'cat-transporte' },
  ];

  it('casa pelo nome do estabelecimento ignorando maiúsculas e acentos', () => {
    expect(
      suggestCategoryFromRules(rules, { merchantName: 'PÃO DE AÇÚCAR LOJA 042' })
    ).toBe('cat-mercado');
    expect(
      suggestCategoryFromRules(rules, { merchantName: 'DROGASIL FILIAL 118' })
    ).toBe('cat-saude');
  });

  it('casa pelo CNPJ do cupom/QR quando regra contém CNPJ', () => {
    expect(
      suggestCategoryFromRules(rules, {
        merchantName: 'COMPANHIA BRASILEIRA DE DISTRIBUICAO',
        cnpj: '47.508.411/0001-56',
      })
    ).toBe('cat-mercado-cnpj');
  });

  it('retorna null quando nenhuma regra casa', () => {
    expect(
      suggestCategoryFromRules(rules, { merchantName: 'LIVRARIA DESCONHECIDA', cnpj: '00000000000000' })
    ).toBeNull();
  });
});
