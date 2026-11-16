import fs from 'fs';
import path from 'path';
import {
  applyCategoryRules,
  decodeStatementBytes,
  normalizeRulePattern,
  normalizeStatementRow,
  parseCsv,
  parseOfx,
  reconcileImportedRows,
  suggestRulePattern,
  type CategoryRuleLike,
  type ReconcilableExistingEntry,
} from '../index';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function readFixtureText(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8');
}

function readFixtureBytes(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
}

describe('Sprint 62 — Domínio de Importação de Extratos e Faturas (Fase A)', () => {
  test('S62-T01: parseOfx lê OFX SGML real do Nubank com conta, FITID, DTPOSTED, TRNAMT e MEMO', () => {
    const bytes = readFixtureBytes('nubank_card.ofx');
    const result = parseOfx(bytes);

    expect(result.format).toBe('sgml');
    expect(result.encoding).toBe('latin1');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toEqual({
      bankId: '260',
      acctId: '00000000-0000-4000-8000-000000000001',
      acctType: 'card',
    });
    expect(result.transactions).toHaveLength(14);
    expect(result.transactions[0]).toMatchObject({
      fitid: '6afa3c6f-1f2d-4eaf-84c2-b1fb441cad01',
      dtPosted: '20261115000000[-3:BRT]',
      trnamt: '-15.46',
      memo: 'Pix no Crédito - DLOCAL BRASIL INSTITUICAO DE PAGAMENTO S A - 1/3',
    });
    expect(result.transactions[7]).toMatchObject({
      fitid: '6aee1aef-0f3a-47aa-8221-9097e1b40308',
      trnamt: '528.11',
      memo: 'Pagamento recebido',
    });
  });

  test('S62-T02: parseOfx lê OFX XML (conta corrente) e decodeStatementBytes preserva acentos latin1/cp1252 e utf-8', () => {
    const xmlText = readFixtureText('checking_xml.ofx');
    const xmlResult = parseOfx(xmlText);

    expect(xmlResult.format).toBe('xml');
    expect(xmlResult.accounts[0]).toEqual({
      bankId: '0341',
      acctId: '12345-6',
      acctType: 'checking',
    });
    expect(xmlResult.transactions).toHaveLength(2);
    expect(xmlResult.transactions[0]).toMatchObject({
      fitid: 'xml-fitid-001',
      trnamt: '3500.00',
      name: 'SALARIO MENSAL',
      memo: 'DEPÓSITO SALÁRIO',
    });

    // Latin1 / Windows-1252 bytes: "CHARSET:1252\n<MEMO>CAFÉ & AÇAÍ</MEMO>"
    const latin1Header = 'OFXHEADER:100\nENCODING:USASCII\nCHARSET:1252\n<MEMO>CAF';
    const latin1Bytes = new Uint8Array([
      ...Array.from(latin1Header).map((ch) => ch.charCodeAt(0)),
      0xc9, // É in latin1/1252
      ...' & A'.split('').map((c) => c.charCodeAt(0)),
      0xc7, // Ç
      ...'A'.split('').map((c) => c.charCodeAt(0)),
      0xcd, // Í
      ...'</MEMO>'.split('').map((c) => c.charCodeAt(0)),
    ]);
    const decoded = decodeStatementBytes(latin1Bytes);
    expect(decoded.encoding).toBe('latin1');
    expect(decoded.text).toContain('CAFÉ & AÇAÍ');
  });

  test('S62-T03: parseCsv detecta separador e perfis Nubank (cartão e conta), Inter, C6 e Itaú', () => {
    const nuCard = parseCsv(readFixtureText('nubank_card.csv'));
    expect(nuCard.profile).toBe('nubank_card');
    expect(nuCard.delimiter).toBe(',');
    expect(nuCard.needsManualMapping).toBe(false);
    expect(nuCard.rows).toHaveLength(14);
    expect(nuCard.rows[0].invertSign).toBe(true);

    const nuChecking = parseCsv(readFixtureText('nubank_checking.csv'));
    expect(nuChecking.profile).toBe('nubank_checking');
    expect(nuChecking.delimiter).toBe(',');
    expect(nuChecking.rows).toHaveLength(3);
    expect(nuChecking.rows[0].fitid).toBe('nu-chk-0001');

    const inter = parseCsv(readFixtureText('inter.csv'));
    expect(inter.profile).toBe('inter');
    expect(inter.delimiter).toBe(';');
    expect(inter.rows).toHaveLength(3);

    const c6 = parseCsv(readFixtureText('c6.csv'));
    expect(c6.profile).toBe('c6');
    expect(c6.delimiter).toBe(';');
    expect(c6.rows).toHaveLength(3);
    expect(c6.rows[1].installmentHint).toBe('3/12');

    const itau = parseCsv(readFixtureText('itau.csv'));
    expect(itau.profile).toBe('itau');
    expect(itau.delimiter).toBe(';');
    expect(itau.rows).toHaveLength(3);
  });

  test('S62-T04: parseCsv pede mapeamento manual quando nenhum perfil casa e aceita colunas manuais', () => {
    const raw = readFixtureText('generic_manual.csv');
    const unknown = parseCsv(raw);
    expect(unknown.profile).toBe('unknown');
    expect(unknown.needsManualMapping).toBe(true);
    expect(unknown.headers).toEqual(['Dia', 'Historico', 'Quantia']);
    expect(unknown.rows).toHaveLength(0);

    const mapped = parseCsv(raw, {
      dateCol: 0,
      descriptionCol: 1,
      amountCol: 2,
    });
    expect(mapped.profile).toBe('manual');
    expect(mapped.needsManualMapping).toBe(false);
    expect(mapped.rows).toHaveLength(2);
    expect(mapped.rows[0]).toMatchObject({
      date: '14/11/2026',
      description: 'Café da manhã',
      amount: '-18,50',
    });
  });

  test('S62-T05: normalizeStatementRow normaliza valores, sinais e parcelas (PARC 03/12, 03/12, 3 de 12)', () => {
    // Nubank cartão: compra positiva vira direction 'out'; pagamento "- 528,11" vira 'in'
    const purchase = normalizeStatementRow(
      {
        date: '2026-11-15',
        description: 'Pix no Crédito - DLOCAL BRASIL INSTITUICAO DE PAGAMENTO S A - 1/3',
        amount: '15,46',
        invertSign: true,
      },
      { accountId: 'acc-card' }
    );
    expect(purchase.date).toBe('2026-11-15');
    expect(purchase.amountCents).toBe(1546);
    expect(purchase.direction).toBe('out');
    expect(purchase.installment).toEqual({ number: 1, total: 3 });

    const payment = normalizeStatementRow(
      {
        date: '2026-11-06',
        description: 'Pagamento recebido',
        amount: '- 528,11',
        invertSign: true,
      },
      { accountId: 'acc-card' }
    );
    expect(payment.amountCents).toBe(52811);
    expect(payment.direction).toBe('in');
    expect(payment.installment).toBeUndefined();

    const parcFormat = normalizeStatementRow(
      {
        date: '08/11/2026',
        description: 'LOJA TECH PARC 03/12',
        amount: '-299.90',
      },
      { accountId: 'acc-card' }
    );
    expect(parcFormat.date).toBe('2026-11-08');
    expect(parcFormat.installment).toEqual({ number: 3, total: 12 });

    const deFormat = normalizeStatementRow(
      {
        date: '12/11/2026',
        description: 'COMPRA CARTAO LOJA ROUPA 3 de 12',
        amount: '-110,00',
      },
      { accountId: 'acc-card' }
    );
    expect(deFormat.installment).toEqual({ number: 3, total: 12 });

    // Data no fim da descrição com número > total não deve virar parcela
    const notInstallment = normalizeStatementRow(
      {
        date: '2026-11-15',
        description: 'COMPRA FEIRA 15/11',
        amount: '-25,00',
      },
      { accountId: 'acc-card' }
    );
    expect(notInstallment.installment).toBeUndefined();
  });

  test('S62-T06: externalId usa FITID quando disponível e hash estável com ordem para linhas idênticas no mesmo dia', () => {
    const withFitid = normalizeStatementRow(
      {
        date: '20261115000000[-3:BRT]',
        description: 'Teste FITID',
        amount: '-15.46',
        fitid: 'fitid-abc-123',
      },
      { accountId: 'acc-1', occurrenceIndex: 0 }
    );
    expect(withFitid.externalId).toBe('fitid-abc-123');

    const rowA0 = normalizeStatementRow(
      {
        date: '2026-11-12',
        description: 'Pix no Crédito - RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        amount: '10,42',
        invertSign: true,
      },
      { accountId: 'acc-1', occurrenceIndex: 0 }
    );
    const rowA1 = normalizeStatementRow(
      {
        date: '2026-11-12',
        description: 'Pix no Crédito - RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        amount: '10,42',
        invertSign: true,
      },
      { accountId: 'acc-1', occurrenceIndex: 1 }
    );
    const rowA0Repeat = normalizeStatementRow(
      {
        date: '2026-11-12',
        description: 'Pix no Crédito - RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        amount: '10,42',
        invertSign: true,
      },
      { accountId: 'acc-1', occurrenceIndex: 0 }
    );

    expect(rowA0.externalId).toBeTruthy();
    expect(rowA0.externalId).toBe(rowA0Repeat.externalId);
    expect(rowA0.externalId).not.toBe(rowA1.externalId);
  });

  test('S62-T07: applyCategoryRules normaliza acentos e escolhe a regra mais específica (exact > starts_with > contains)', () => {
    expect(normalizeRulePattern('  ARCOS DOURADOS COMÉRCIO  ')).toBe('arcos dourados comercio');
    expect(
      suggestRulePattern('Shopee *Dncleoinformti - Parcela 12/12')
    ).toBe('Shopee *Dncleoinformti');

    const rules: CategoryRuleLike[] = [
      {
        id: 'r-contains-short',
        match_type: 'contains',
        pattern: 'ifood',
        kind: 'expense',
        category_id: 'cat-lazer',
        hits: 10,
      },
      {
        id: 'r-starts',
        match_type: 'starts_with',
        pattern: 'ifood - nupay',
        kind: 'expense',
        category_id: 'cat-mercado',
        hits: 1,
      },
      {
        id: 'r-exact',
        match_type: 'exact',
        pattern: 'pagamento recebido',
        kind: 'income',
        category_id: 'cat-outros-receita',
        hits: 2,
      },
      {
        id: 'r-contains-long',
        match_type: 'contains',
        pattern: 'arcos dourados comercio',
        kind: 'expense',
        category_id: 'cat-lazer',
        hits: 1,
      },
      {
        id: 'r-contains-short-arcos',
        match_type: 'contains',
        pattern: 'arcos',
        kind: 'expense',
        category_id: 'cat-mercado',
        hits: 50,
      },
    ];

    const rows = [
      normalizeStatementRow(
        { date: '2026-11-02', description: 'iFood - NuPay - 2/2', amount: '14,37', invertSign: true },
        { accountId: 'acc-1', occurrenceIndex: 0 }
      ),
      normalizeStatementRow(
        { date: '2026-11-14', description: 'ARCOS DOURADOS COMÉRCIO DE ALIMENTOS S.A. - NuPay', amount: '19,90', invertSign: true },
        { accountId: 'acc-1', occurrenceIndex: 0 }
      ),
      normalizeStatementRow(
        { date: '2026-11-06', description: 'Pagamento recebido', amount: '- 528,11', invertSign: true },
        { accountId: 'acc-1', occurrenceIndex: 0 }
      ),
      normalizeStatementRow(
        { date: '2026-11-09', description: 'Mp *Melimais', amount: '9,90', invertSign: true },
        { accountId: 'acc-1', occurrenceIndex: 0 }
      ),
    ];

    const categorized = applyCategoryRules(rows, rules);
    expect(categorized[0].categoryId).toBe('cat-mercado');
    expect(categorized[0].matchedRuleId).toBe('r-starts');

    expect(categorized[1].categoryId).toBe('cat-lazer');
    expect(categorized[1].matchedRuleId).toBe('r-contains-long');

    expect(categorized[2].categoryId).toBe('cat-outros-receita');
    expect(categorized[2].matchedRuleId).toBe('r-exact');

    expect(categorized[3].categoryId).toBe('cat-outros-despesa');
    expect(categorized[3].matchedRuleId).toBeUndefined();
  });

  test('S62-T08: reconcileImportedRows marca nova, duplicada (external_id) e baixa de pendente (até 5 dias)', () => {
    const existing: ReconcilableExistingEntry[] = [
      {
        id: 'e-dup',
        account_id: 'acc-1',
        external_id: 'fitid-already-imported',
        amount_cents: 1546,
        kind: 'expense',
        status: 'paid',
        due_date: '2026-11-15',
      },
      {
        id: 'e-pending-5d',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 11990,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-14', // 5 dias depois de 2026-11-09 -> deve casar
      },
      {
        id: 'e-pending-6d',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 5274,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-16', // 7 dias depois de 2026-11-09 -> NÃO casa
      },
      {
        id: 'e-other-account',
        account_id: 'acc-2',
        external_id: null,
        amount_cents: 990,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-09',
      },
    ];

    const rows = [
      {
        ...normalizeStatementRow(
          { date: '2026-11-15', description: 'Compra já importada', amount: '-15.46', fitid: 'fitid-already-imported' },
          { accountId: 'acc-1' }
        ),
        categoryId: 'cat-outros-despesa',
      },
      {
        ...normalizeStatementRow(
          { date: '2026-11-09', description: 'INTERNET FIBRA', amount: '-119.90', fitid: 'fitid-internet' },
          { accountId: 'acc-1' }
        ),
        categoryId: 'cat-moradia',
      },
      {
        ...normalizeStatementRow(
          { date: '2026-11-09', description: 'AUTO POSTO AVENIDA', amount: '-52.74', fitid: 'fitid-posto' },
          { accountId: 'acc-1' }
        ),
        categoryId: 'cat-transporte',
      },
      {
        ...normalizeStatementRow(
          { date: '2026-11-09', description: 'Mp *Melimais', amount: '-9.90', fitid: 'fitid-meli' },
          { accountId: 'acc-1' }
        ),
        categoryId: 'cat-assinaturas',
      },
    ];

    const reconciled = reconcileImportedRows(rows, existing, 'acc-1');
    expect(reconciled[0].reconcileStatus).toBe('duplicate');
    expect(reconciled[1].reconcileStatus).toBe('settle_pending');
    expect(reconciled[1].matchedEntryId).toBe('e-pending-5d');
    expect(reconciled[2].reconcileStatus).toBe('new');
    expect(reconciled[3].reconcileStatus).toBe('new');
  });

  test('S62-T09: reconcileImportedRows não casa o mesmo lançamento pendente duas vezes no mesmo lote', () => {
    const existing: ReconcilableExistingEntry[] = [
      {
        id: 'e-pending-single',
        account_id: 'acc-1',
        external_id: null,
        amount_cents: 1042,
        kind: 'expense',
        status: 'pending',
        due_date: '2026-11-12',
      },
    ];

    const rows = [
      {
        ...normalizeStatementRow(
          { date: '2026-11-12', description: 'RENOVAPAY', amount: '10,42', invertSign: true },
          { accountId: 'acc-1', occurrenceIndex: 0 }
        ),
        categoryId: 'cat-outros-despesa',
      },
      {
        ...normalizeStatementRow(
          { date: '2026-11-12', description: 'RENOVAPAY', amount: '10,42', invertSign: true },
          { accountId: 'acc-1', occurrenceIndex: 1 }
        ),
        categoryId: 'cat-outros-despesa',
      },
    ];

    const reconciled = reconcileImportedRows(rows, existing, 'acc-1');
    expect(reconciled[0].reconcileStatus).toBe('settle_pending');
    expect(reconciled[0].matchedEntryId).toBe('e-pending-single');
    expect(reconciled[1].reconcileStatus).toBe('new');
    expect(reconciled[1].matchedEntryId).toBeUndefined();
  });
});
