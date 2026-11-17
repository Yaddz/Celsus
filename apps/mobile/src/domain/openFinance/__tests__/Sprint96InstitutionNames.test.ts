/**
 * Sprint 96 — Nome real da instituição nas conexões Meu Pluggy e recibos/direitos de subscrição de FII.
 * Origem: backup de 17/11/2026 19:50 — contas "MeuPluggy · Conta corrente ·· 3671", carteiras "Corretora 6ef1"
 * e MXRF12/MXRF13 (subtype STOCK na Pluggy) listados como ação.
 */
import {
  institutionFromCompe,
  parseTransferNumberCompe,
  resolveInstitutionName,
} from '../institutions';
import { buildAccountName } from '../naming';
import { mapPluggyInvestment, resolvePluggyAssetClass } from '../investments';
import { resolveBrokerDisplayName } from '../../../services/pluggy/pluggyPortfolioService';
import type { PluggyAccount, PluggyInvestment } from '../../../services/pluggy/types';

function account(overrides: Partial<PluggyAccount>): PluggyAccount {
  return {
    id: 'acc',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '0012343671',
    name: 'Conta Corrente',
    balance: 0,
    itemId: 'item',
    currencyCode: 'BRL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  } as PluggyAccount;
}

function equityInv(overrides: Partial<PluggyInvestment>): PluggyInvestment {
  return {
    id: 'inv',
    itemId: 'item',
    type: 'EQUITY',
    subtype: 'STOCK',
    number: null,
    balance: 0,
    name: 'MXRF13',
    code: 'MXRF13',
    isin: null,
    quantity: 0,
    value: 0,
    amount: 0,
    amountOriginal: null,
    status: 'TOTAL_WITHDRAWAL',
    priceFactor: 0,
    date: '2026-11-16T00:00:00.000Z',
    currencyCode: 'BRL',
    ...overrides,
  } as PluggyInvestment;
}

describe('Sprint 96 — instituição pelo código COMPE', () => {
  it('S96-T01: extrai o COMPE do transferNumber e traduz para o nome da instituição', () => {
    expect(parseTransferNumberCompe('348/0001/12345-6')).toBe('348');
    expect(parseTransferNumberCompe('33/1234/000123-4')).toBe('033');
    expect(parseTransferNumberCompe('')).toBeNull();
    expect(parseTransferNumberCompe(null)).toBeNull();
    expect(institutionFromCompe('348')).toBe('XP');
    expect(institutionFromCompe('102')).toBe('XP');
    expect(institutionFromCompe('260')).toBe('Nubank');
    expect(institutionFromCompe('208')).toBe('BTG Pactual');
    expect(institutionFromCompe('033')).toBe('Santander');
    expect(institutionFromCompe('33')).toBe('Santander');
    expect(institutionFromCompe('341')).toBe('Itaú');
    expect(institutionFromCompe('999')).toBeNull();
  });

  it('S96-T02: conta Meu Pluggy usa o banco do próprio transferNumber, não "MeuPluggy"', () => {
    const acc = account({ bankData: { transferNumber: '260/0001/1234367-1' } as any });
    expect(buildAccountName(acc, 'MeuPluggy')).toBe('Nubank · Conta corrente ·· 3671');
  });

  it('S96-T03: cartão sem transferNumber usa a instituição da conexão; nome que já cita o banco não repete', () => {
    const platinum = account({
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: '**** 8926',
      name: 'platinum',
      marketingName: null,
    });
    expect(buildAccountName(platinum, 'MeuPluggy', 'Nubank')).toBe('Nubank · Platinum ·· 8926');

    const xp = account({
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: '**** 8297',
      name: 'Cartão XP Visa Infinite',
    });
    expect(buildAccountName(xp, 'MeuPluggy', 'XP')).toBe('Cartão XP Visa Infinite ·· 8297');
  });

  it('S96-T04: sem nenhuma pista da instituição, "MeuPluggy" não entra no nome', () => {
    const acc = account({});
    expect(buildAccountName(acc, 'MeuPluggy')).toBe('Conta corrente ·· 3671');
    // Conector real continua valendo
    expect(buildAccountName(acc, 'Itaú')).toBe('Itaú · Conta corrente ·· 3671');
  });

  it('S96-T05: resolveInstitutionName — conector real, depois investimentos, depois contas', () => {
    expect(resolveInstitutionName({ connectorName: 'Nubank' })).toBe('Nubank');
    expect(
      resolveInstitutionName({
        connectorName: 'MeuPluggy',
        accounts: [account({ bankData: { transferNumber: '348/0001/99999-9' } as any })],
      })
    ).toBe('XP');
    expect(
      resolveInstitutionName({
        connectorName: 'MeuPluggy',
        investments: [{ institution: { name: 'XP INVESTIMENTOS CCTVM S/A', number: '102' } } as any],
      })
    ).toBe('XP');
    expect(
      resolveInstitutionName({
        connectorName: 'MeuPluggy',
        investments: [{ institution: { name: 'Banco Inter S.A.', number: null } } as any],
      })
    ).toBe('Banco Inter S.A.');
    expect(resolveInstitutionName({ connectorName: 'MeuPluggy' })).toBeNull();
  });

  it('S96-T06: carteira da conexão Meu Pluggy recebe o nome da corretora pelas contas', () => {
    const accounts = [account({ bankData: { transferNumber: '208/0001/1234567-8' } as any })];
    expect(resolveBrokerDisplayName('d688b0a9-0591-4c45-ae1a-74c5392cd2f7', 'MeuPluggy', null, accounts)).toBe(
      'BTG Pactual'
    );
    expect(resolveBrokerDisplayName('d688b0a9-0591-4c45-ae1a-74c5392cd2f7', 'MeuPluggy', null, [])).toBe(
      'Corretora d2f7'
    );
  });
});

describe('Sprint 96 — recibos e direitos de subscrição de FII', () => {
  it('S96-T07: final 12 a 15 é direito/recibo de subscrição de FII, não ação', () => {
    expect(resolvePluggyAssetClass(equityInv({ code: 'MXRF13' })).assetClass).toBe('FII');
    expect(resolvePluggyAssetClass(equityInv({ code: 'MXRF12' })).assetClass).toBe('FII');
    expect(resolvePluggyAssetClass(equityInv({ code: 'HGLG14', subtype: 'STOCK' })).assetClass).toBe('FII');
    // Units e ações continuam ações
    expect(resolvePluggyAssetClass(equityInv({ code: 'BPAC11', status: 'ACTIVE' })).assetClass).toBe('STOCK');
    expect(resolvePluggyAssetClass(equityInv({ code: 'PETR4', status: 'ACTIVE' })).assetClass).toBe('STOCK');
  });

  it('S96-T08: nome identifica o recibo/direito e o fundo de origem', () => {
    expect(mapPluggyInvestment(equityInv({ id: 'r13', code: 'MXRF13', name: 'MXRF13' })).name).toBe(
      'Recibo de subscrição MXRF11'
    );
    expect(mapPluggyInvestment(equityInv({ id: 'r12', code: 'MXRF12', name: 'MXRF12' })).name).toBe(
      'Direito de subscrição MXRF11'
    );
    expect(mapPluggyInvestment(equityInv({ id: 'r13', code: 'MXRF13', name: 'MXRF13' })).ticker).toBe('MXRF13');
  });
});
