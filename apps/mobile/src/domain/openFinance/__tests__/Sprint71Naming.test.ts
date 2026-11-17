import {
  buildAccountName,
  buildInvestmentDisplay,
  cleanTransactionDescription,
} from '../naming';
import type { PluggyAccount, PluggyInvestment } from '../../../services/pluggy/types';

function makeInv(overrides: Partial<PluggyInvestment> = {}): PluggyInvestment {
  return {
    id: 'inv-1',
    itemId: 'item-1',
    type: 'FIXED_INCOME',
    subtype: 'CDB',
    balance: 10000,
    name: 'CDB',
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...overrides,
  };
}

function makeAcc(overrides: Partial<PluggyAccount> = {}): PluggyAccount {
  return {
    id: 'acc-1',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '0001234-5',
    name: 'Conta Corrente',
    balance: 1000,
    itemId: 'item-1',
    currencyCode: 'BRL',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...overrides,
  };
}

describe('Sprint 71 — Nomenclatura Legível Open Finance (Fase A)', () => {
  describe('S71-T19: Renda Fixa e COE por subtipo', () => {
    it('gera ticker curto e nome completo legível para CDB, LCI, LCA, Tesouro, Debêntures, CRI, CRA e COE', () => {
      const cdb = buildInvestmentDisplay(
        makeInv({
          subtype: 'CDB',
          issuer: 'Banco BTG Pactual S.A.',
          rate: 110,
          rateType: 'CDI',
          dueDate: '2028-03-15',
          isin: 'BRBTGCDB0001',
        })
      );
      expect(cdb.ticker).toBe('CDB BTG');
      expect(cdb.name).toBe('CDB Banco BTG Pactual · 110% CDI · venc. 03/2028');
      expect(cdb.ticker).not.toContain('BRBTGCDB');

      const lci = buildInvestmentDisplay(
        makeInv({
          subtype: 'LCI',
          issuer: 'Itaú Unibanco S.A.',
          rate: 95,
          rateType: 'CDI',
          dueDate: '2027-08-01',
        })
      );
      expect(lci.ticker).toBe('LCI ITAU');
      expect(lci.name).toContain('95% CDI');
      expect(lci.name).toContain('venc. 08/2027');

      const lca = buildInvestmentDisplay(
        makeInv({
          subtype: 'LCA',
          issuer: 'Banco do Brasil S.A.',
          rate: 92,
          rateType: 'CDI',
          dueDate: '2027-11-20',
        })
      );
      expect(lca.ticker).toBe('LCA BB');

      const tesouro = buildInvestmentDisplay(
        makeInv({
          subtype: 'TREASURY',
          name: 'TESOURO IPCA+ 2035',
          rate: 6.2,
          rateType: 'IPCA',
          dueDate: '2035-05-15',
          issuer: 'Tesouro Nacional',
        })
      );
      expect(tesouro.ticker).toBe('TESOURO IPCA+ 2035');
      expect(tesouro.name).toContain('venc. 05/2035');

      const deb = buildInvestmentDisplay(
        makeInv({
          subtype: 'DEBENTURES',
          issuer: 'Vale S.A.',
          rate: 5.5,
          rateType: 'IPCA',
          dueDate: '2030-07-15',
        })
      );
      expect(deb.ticker).toBe('DEB VALE');

      const cri = buildInvestmentDisplay(
        makeInv({
          subtype: 'CRI',
          issuer: 'Opea Securitizadora',
          rate: 12.5,
          rateType: 'PRE',
          dueDate: '2029-01-10',
        })
      );
      expect(cri.ticker).toBe('CRI OPEA');

      const cra = buildInvestmentDisplay(
        makeInv({
          subtype: 'CRA',
          issuer: 'Ecoagro Securitizadora',
          rate: 11.8,
          rateType: 'PRE',
          dueDate: '2028-12-10',
        })
      );
      expect(cra.ticker).toBe('CRA ECOAGRO');

      const coe = buildInvestmentDisplay(
        makeInv({
          type: 'COE',
          subtype: 'STRUCTURED_NOTE',
          issuer: 'XP Investimentos',
          rate: 14,
          rateType: 'PRE',
          dueDate: '2027-06-01',
        })
      );
      expect(coe.ticker).toBe('COE XP');
    });
  });

  describe('S71-T20: Fundos, Previdência, Renda Variável e Colisões', () => {
    it('gera sigla derivada sem stopwords para fundos e previdência, ticker normalizado para ações/FIIs e desempata colisões', () => {
      const fundo1 = buildInvestmentDisplay(
        makeInv({
          type: 'MUTUAL_FUND',
          subtype: 'MULTIMARKET_FUND',
          name: 'ALASKA BLACK FIC DE FUNDO DE INVESTIMENTO EM ACOES',
          isin: 'BRALSK00001',
        })
      );
      expect(fundo1.ticker).not.toContain('BRALSK');
      expect(fundo1.ticker).toMatch(/^ALASKA|AB/);
      expect(fundo1.name).toBe('Alaska Black FIC de Fundo de Investimento em Ações'.replace('Ações', 'Acoes'));

      const fundo2 = buildInvestmentDisplay(
        makeInv({
          type: 'MUTUAL_FUND',
          subtype: 'FIXED_INCOME_FUND',
          name: 'KINEA ATLAS II FI MULTIMERCADO LP',
        })
      );
      expect(fundo2.ticker.length).toBeLessThanOrEqual(12);
      expect(fundo2.ticker).not.toMatch(/\b(FI|LP|DE)\b/);

      const prev = buildInvestmentDisplay(
        makeInv({
          type: 'SECURITY',
          subtype: 'RETIREMENT',
          name: 'BRASILPREV RT FIXA PGBL',
        })
      );
      expect(prev.ticker.length).toBeGreaterThanOrEqual(2);
      expect(prev.ticker).not.toBe('inv-1');

      const stock = buildInvestmentDisplay(
        makeInv({
          type: 'EQUITY',
          subtype: 'STOCK',
          code: 'petr4f',
          name: 'PETROLEO BRASILEIRO S.A. PETROBRAS',
        })
      );
      expect(stock.ticker).toBe('PETR4');
      expect(stock.name).not.toBe('PETR4');

      // Colisão de ticker em CDBs diferentes
      const used = new Set<string>();
      const cdbA = buildInvestmentDisplay(
        makeInv({
          id: 'cdb-a',
          subtype: 'CDB',
          issuer: 'Banco BTG Pactual',
          dueDate: '2027-03-01',
          number: '1111',
        }),
        used
      );
      used.add(cdbA.ticker);
      const cdbB = buildInvestmentDisplay(
        makeInv({
          id: 'cdb-b',
          subtype: 'CDB',
          issuer: 'Banco BTG Pactual',
          dueDate: '2029-05-01',
          number: '2222',
        }),
        used
      );
      expect(cdbA.ticker).not.toBe(cdbB.ticker);
    });
  });

  describe('S71-T21: Nomes de Contas e Cartões', () => {
    it('formata "<Banco> · <tipo> ·· 1234" e diferencia duas contas do mesmo banco', () => {
      const checking1 = buildAccountName(
        makeAcc({ number: '0012345-6', subtype: 'CHECKING_ACCOUNT', name: 'Conta Corrente' }),
        'Itaú'
      );
      const checking2 = buildAccountName(
        makeAcc({ number: '0098765-4', subtype: 'CHECKING_ACCOUNT', name: 'Conta Corrente' }),
        'Itaú'
      );
      expect(checking1).toBe('Itaú · Conta corrente ·· 3456');
      expect(checking2).toBe('Itaú · Conta corrente ·· 7654');
      expect(checking1).not.toBe(checking2);

      const savings = buildAccountName(
        makeAcc({ number: '998811', subtype: 'SAVINGS_ACCOUNT', name: 'Poupança' }),
        'Banco do Brasil'
      );
      expect(savings).toBe('Banco do Brasil · Poupança ·· 8811');

      const card = buildAccountName(
        makeAcc({
          type: 'CREDIT',
          subtype: 'CREDIT_CARD',
          number: '**** 9876',
          name: 'Cartão Platinum',
          marketingName: 'Cartão Platinum',
        }),
        'Nubank'
      );
      expect(card).toBe('Nubank · Cartão Platinum ·· 9876');

      const noNumber = buildAccountName(
        makeAcc({ number: '', subtype: 'CHECKING_ACCOUNT', name: 'Conta' }),
        'Inter'
      );
      expect(noNumber).toBe('Inter · Conta corrente');
    });
  });

  describe('S71-T22: Limpeza de Descrições de Transação', () => {
    it('remove prefixos operacionais e códigos numéricos longos mantendo capitalização legível', () => {
      expect(cleanTransactionDescription('PIX ENVIADO - PADARIA DO ZE 0012345')).toBe('Padaria do Zé'.replace('Zé', 'Ze'));
      expect(cleanTransactionDescription('PIX RECEBIDO - MARIA SILVA 99887766')).toBe('Maria Silva');
      expect(cleanTransactionDescription('COMPRA CARTAO ELO - SUPERMERCADO EXTRA 123456')).toBe('Supermercado Extra');
      expect(cleanTransactionDescription('PAGAMENTO DE BOLETO - ENEL SP 0000123456')).toBe('Enel SP');
      expect(cleanTransactionDescription('TED ENVIADA - JOAO PEDRO')).toBe('Joao Pedro');
      expect(cleanTransactionDescription('DOC RECEBIDO - EMPRESA LTDA')).toBe('Empresa Ltda');
      expect(cleanTransactionDescription('DEBITO AUTOMATICO - VIVO FIBRA 88776655')).toBe('Vivo Fibra');
      expect(cleanTransactionDescription('UBER *TRIP 123456789')).toBe('Uber Trip');
    });
  });
});
