import {
  formatPluggyExecutionStatus,
  formatPluggyItemStatus,
  formatPluggyLastUpdatedBrt,
} from '../itemStatus';
import {
  collectItemWarningsPtBr,
  translatePluggyWarning,
} from '../warnings';

describe('Sprint 102 — Saúde da conexão, status A.7 e avisos A.8', () => {
  it('S102-T01: formata lastUpdatedAt em BRT ("Dados do Meu Pluggy de 17/11 às 06:12") e traduz status A.7', () => {
    expect(formatPluggyLastUpdatedBrt('2026-11-17T09:12:00.000Z')).toBe(
      'Dados do Meu Pluggy de 17/11 às 06:12'
    );
    expect(formatPluggyItemStatus('UPDATED', 'SUCCESS')).toMatch(/atualizad/i);
    expect(formatPluggyItemStatus('LOGIN_ERROR', 'INVALID_CREDENTIALS')).toMatch(
      /erro|credencia/i
    );
    expect(formatPluggyExecutionStatus('PARTIAL_SUCCESS')).toMatch(/parcial/i);
    expect(formatPluggyExecutionStatus('USER_AUTHORIZATION_EXPIRED')).toMatch(
      /expirad|vencid/i
    );
  });

  it('S102-T02: traduz códigos A.8 (CC_005, TXN_003) e usa fallback providerMessage ?? message para desconhecidos', () => {
    expect(
      translatePluggyWarning({
        code: 'CC_005',
        message: 'Bills not authorized',
      })
    ).toBe('Faturas do cartão não autorizadas.');

    expect(
      translatePluggyWarning({
        code: 'TXN_003',
        message: 'Rate limit',
      })
    ).toBe('Limite de consultas do banco atingido; transações podem estar incompletas.');

    expect(
      translatePluggyWarning({
        code: 'UNKNOWN_999',
        message: 'Fallback message',
        providerMessage: 'Mensagem do banco',
      })
    ).toBe('Mensagem do banco');

    expect(
      translatePluggyWarning({
        code: 'UNKNOWN_999',
        message: 'Fallback message',
      })
    ).toBe('Fallback message');

    const statusDetailJson = JSON.stringify({
      creditCards: {
        isUpdated: false,
        warnings: [{ code: 'CC_005', message: 'raw', providerMessage: 'Consentimento sem faturas' }],
      },
      transactions: {
        isUpdated: true,
        warnings: [{ code: 'TXN_003', message: 'rate' }],
      },
    });
    const list = collectItemWarningsPtBr(statusDetailJson);
    expect(list).toHaveLength(2);
    expect(list[0].text).toBe('Faturas do cartão não autorizadas.');
    expect(list[0].detail).toBe('Consentimento sem faturas');
    expect(list[1].text).toBe(
      'Limite de consultas do banco atingido; transações podem estar incompletas.'
    );
  });
});
