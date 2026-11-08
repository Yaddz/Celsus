import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';
import { readStatementFile } from '../../../services/b3/readStatementFile';
import {
  parseStatementRows,
  classifyMovement,
  normalizeTicker,
  inferAssetClass,
  reconcileOpeningBalances,
  buildImportPlan,
  B3ParsingError,
  EmptyFileError,
  UnrecognizedFormatError,
  MissingColumnError,
  UnsupportedStatementError,
} from '../index';

const exampleJsonPath = path.resolve(__dirname, 'fixtures/b3-exemplo.rows.json');
const rawExampleRows: Array<Record<string, string>> = JSON.parse(
  fs.readFileSync(exampleJsonPath, 'utf8')
);

const realXlsxPath = path.resolve(
  __dirname,
  '../../../../../../docs/exemplos/b3-movimentacao-exemplo.xlsx'
);

describe('Sprint 46: Núcleo da importação B3 (spec §7.1–§7.5 e §7.7)', () => {
  // =========================================================================
  // S46-T01: Leitor XLSX ponta a ponta
  // =========================================================================
  it('S46-T01: reads real b3-movimentacao-exemplo.xlsx producing 33 rows with normalized columns', async () => {
    const fileBytes = new Uint8Array(fs.readFileSync(realXlsxPath));
    const result = await readStatementFile(fileBytes, 'b3-movimentacao-exemplo.xlsx');

    expect(result.length).toBe(33);
    const first = result[0];
    expect(first).toHaveProperty('entradaSaida');
    expect(first).toHaveProperty('data');
    expect(first).toHaveProperty('movimentacao');
    expect(first).toHaveProperty('produto');
    expect(first).toHaveProperty('instituicao');
    expect(first).toHaveProperty('quantidade');
    expect(first).toHaveProperty('precoUnitario');
    expect(first).toHaveProperty('valorOperacao');

    expect(first.entradaSaida).toBe('Credito');
    expect(first.data).toBe('28/10/2026');
    expect(first.produto).toContain('ALUP11');
  });

  // =========================================================================
  // S46-T02: Leitor CSV (; e , com e sem BOM)
  // =========================================================================
  it('S46-T02: reads CSV files with semicolon or comma separators and optional BOM', async () => {
    const csvSemicolon =
      '\uFEFFEntrada/Saída;Data;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da Operação\n' +
      'Credito;28/10/2026;Transferência - Liquidação;ALUP11 - ALUPAR;BTG;3;31,11;93,33\n' +
      'Debito;24/08/2026;Transferência - Liquidação;MXRF11 - MAXI RENDA;XP;265;9,23;2445,95';

    const bytesSemicolon = new TextEncoder().encode(csvSemicolon);
    const rowsSemi = await readStatementFile(bytesSemicolon, 'extrato.csv');
    expect(rowsSemi.length).toBe(2);
    expect(rowsSemi[0].produto).toContain('ALUP11');
    expect(rowsSemi[1].quantidade).toBe('265');

    const csvComma =
      'Entrada/Saída,Data,Movimentação,Produto,Instituição,Quantidade,Preço unitário,Valor da Operação\n' +
      'Credito,28/10/2026,Transferência - Liquidação,"ALUP11 - ALUPAR",BTG,3,31.11,93.33';

    const bytesComma = new TextEncoder().encode(csvComma);
    const rowsComma = await readStatementFile(bytesComma, 'extrato_comma.csv');
    expect(rowsComma.length).toBe(1);
    expect(rowsComma[0].produto).toContain('ALUP11');
  });

  // =========================================================================
  // S46-T03: Erros tipados no leitor
  // =========================================================================
  it('S46-T03: throws typed errors on empty file, invalid format, missing column, and negotiation report', async () => {
    // 1. Arquivo vazio
    await expect(readStatementFile(new Uint8Array(0), 'vazio.xlsx')).rejects.toThrow(
      EmptyFileError
    );

    // 2. Formato não suportado
    await expect(
      readStatementFile(new TextEncoder().encode('dados aleatorios'), 'arquivo.pdf')
    ).rejects.toThrow(UnrecognizedFormatError);

    // 3. Coluna ausente
    const csvIncompleto =
      'Data;Movimentação;Produto;Instituição\n28/10/2026;Transferência;ALUP11;BTG';
    await expect(
      readStatementFile(new TextEncoder().encode(csvIncompleto), 'incompleto.csv')
    ).rejects.toThrow(MissingColumnError);

    // 4. Relatório de negociação recusado com erro amigável
    const csvNegociacao =
      'Data do Negócio;Código de Negociação;Quantidade;Preço\n28/10/2026;PETR4;100;30.00';
    await expect(
      readStatementFile(new TextEncoder().encode(csvNegociacao), 'negociacao.csv')
    ).rejects.toThrow(UnsupportedStatementError);
  });

  // =========================================================================
  // S46-T04: Parse e normalização de linhas
  // =========================================================================
  it('S46-T04: parses rows, normalizes date, ticker, product name, institution, numbers, and nulls', () => {
    const parsed = parseStatementRows(rawExampleRows);
    expect(parsed.length).toBe(33);

    // Primeira linha: ALUP11
    const row0 = parsed[0];
    expect(row0.rowNo).toBe(1);
    expect(row0.rawDate).toBe('28/10/2026');
    expect(row0.tradeDate).toBe('2026-10-28');
    expect(row0.ticker).toBe('ALUP11');
    expect(row0.productName).toBe('ALUPAR INVESTIMENTOS S/A');
    expect(row0.institution).toBe('BANCO BTG PACTUAL S/A'); // Sem o ponto final
    expect(row0.quantity).toBe('3');
    expect(row0.unitPrice).toBe('31.11');
    expect(row0.operationValue).toBe('93.33');

    // Linha com "-" em preço e valor (linha 19: Atualização)
    const row18 = parsed[18];
    expect(row18.rawMovement).toBe('Atualização');
    expect(row18.unitPrice).toBeNull();
    expect(row18.operationValue).toBeNull();
    expect(row18.quantity).toBe('168');
  });

  // =========================================================================
  // S46-T05: Classificação exata das 33 linhas do Apêndice A
  // =========================================================================
  it('S46-T05: classifies all 33 rows from Appendix A into BUY, SELL, INCOME, or IGNORE', () => {
    const parsed = parseStatementRows(rawExampleRows);
    const classifications = parsed.map((r) => classifyMovement(r));

    const buys = classifications.filter((c) => c.kind === 'BUY');
    const sells = classifications.filter((c) => c.kind === 'SELL');
    const incomes = classifications.filter((c) => c.kind === 'INCOME');
    const ignores = classifications.filter((c) => c.kind === 'IGNORE');
    const reviews = classifications.filter((c) => c.kind === 'REVIEW');

    expect(buys.length).toBe(18); // 17 liquidações + 1 subscrição exercida
    expect(sells.length).toBe(1); // Linha 18: MXRF11 265 a 9.23
    expect(incomes.length).toBe(7); // 7 rendimentos
    expect(ignores.length).toBe(7); // 7 atualizações e recibos
    expect(reviews.length).toBe(0);

    // Verifica linha de subscrição exercida (linha 29 no apêndice, índice 28)
    const subExercida = parsed[28];
    expect(subExercida.rawMovement).toBe('Direitos de Subscrição - Exercido');
    const subClass = classifyMovement(subExercida);
    expect(subClass.kind).toBe('BUY');
    expect(subClass.reason).toContain('Subscrição');

    // Verifica linha de venda (linha 18 no apêndice, índice 17)
    const venda = parsed[17];
    expect(venda.rawMovement).toBe('Transferência - Liquidação');
    expect(venda.entryExit).toBe('DEBIT');
    const vendaClass = classifyMovement(venda);
    expect(vendaClass.kind).toBe('SELL');
  });

  // =========================================================================
  // S46-T06: Casos de revisão (movimentações desconhecidas ou sem preço)
  // =========================================================================
  it('S46-T06: classifies unknown movements or invalid price/qty as REVIEW', () => {
    // 1. Desdobramento / split não automatizado
    const rowSplit = {
      rowNo: 1,
      entryExit: 'CREDIT' as const,
      rawDate: '10/10/2026',
      tradeDate: '2026-10-10',
      rawMovement: 'Desdobramento',
      rawProduct: 'PETR4 - PETROBRAS',
      ticker: 'PETR4',
      productName: 'PETROBRAS',
      institution: 'XP',
      quantity: '100',
      unitPrice: null,
      operationValue: null,
    };
    expect(classifyMovement(rowSplit).kind).toBe('REVIEW');

    // 2. Compra com quantidade 0
    const rowZeroQty = { ...rowSplit, rawMovement: 'Transferência - Liquidação', quantity: '0', unitPrice: '10.00', operationValue: '0.00' };
    expect(classifyMovement(rowZeroQty).kind).toBe('REVIEW');

    // 3. Compra sem preço
    const rowNoPrice = { ...rowSplit, rawMovement: 'Transferência - Liquidação', quantity: '10', unitPrice: null, operationValue: null };
    expect(classifyMovement(rowNoPrice).kind).toBe('REVIEW');
  });

  // =========================================================================
  // S46-T07: Normalização de tickers (MXRF12/13 -> MXRF11)
  // =========================================================================
  it('S46-T07: normalizes subscription rights/receipts to base ticker', () => {
    expect(normalizeTicker('MXRF12')).toBe('MXRF11');
    expect(normalizeTicker('MXRF13')).toBe('MXRF11');
    expect(normalizeTicker('HGLG12')).toBe('HGLG11');
    expect(normalizeTicker('PETR4')).toBe('PETR4');
    expect(normalizeTicker('ALUP11')).toBe('ALUP11');
  });

  // =========================================================================
  // S46-T08: Inferência de classe de ativos
  // =========================================================================
  it('S46-T08: infers asset class correctly respecting static catalog and heuristic order', () => {
    // 1. Units de ações do catálogo (ALUP11, BPAC11)
    expect(inferAssetClass({ ticker: 'ALUP11', productName: 'ALUPAR' }).class).toBe('STOCK');
    expect(inferAssetClass({ ticker: 'BPAC11', productName: 'BTG PACTUAL' }).class).toBe('STOCK');

    // 2. FIIs conhecidos terminados em 11
    expect(inferAssetClass({ ticker: 'MXRF11', productName: 'MAXI RENDA FII' }).class).toBe('FII');
    expect(inferAssetClass({ ticker: 'HGLG11', productName: 'CSHG LOGISTICA FDO INV IMOB' }).class).toBe('FII');

    // 3. Ações padrão por final 3, 4, 5, 6
    expect(inferAssetClass({ ticker: 'WEGE3', productName: 'WEG S.A.' }).class).toBe('STOCK');
    expect(inferAssetClass({ ticker: 'BBDC4', productName: 'BRADESCO' }).class).toBe('STOCK');
    expect(inferAssetClass({ ticker: 'SAPR4', productName: 'SANEPAR' }).class).toBe('STOCK');

    // 4. Ticker desconhecido com 'FII' ou 'FDO INV IMOB' no nome do produto
    const guessFii = inferAssetClass({ ticker: 'NOVO11', productName: 'FUNDO DE INVESTIMENTO IMOBILIARIO' });
    expect(guessFii.class).toBe('FII');
    expect(guessFii.confidence).toBe('guess');

    // 5. Sem correspondência
    const unknown = inferAssetClass({ ticker: 'XYZW99', productName: 'EMPRESA DESCONHECIDA' });
    expect(unknown.confidence).toBe('unknown');
  });

  // =========================================================================
  // S46-T09: Reconciliação de saldo anterior (inferência de posição inicial)
  // =========================================================================
  it('S46-T09: reconciles opening balances, detecting 606 missing shares for MXRF11 and zero for others', () => {
    const parsed = parseStatementRows(rawExampleRows);
    const openingBalances = reconcileOpeningBalances(parsed);

    // No arquivo de exemplo, apenas MXRF11 possui déficit de saldo inicial
    expect(openingBalances.length).toBe(1);
    const mxrf = openingBalances[0];
    expect(mxrf.ticker).toBe('MXRF11');
    expect(mxrf.missingQuantity).toBe('606');
    expect(mxrf.asOfDate).toBe('2026-05-14'); // 1 dia antes da 1ª linha (15/05/2026)

    // Teste sintético: venda que excede a posição gera déficit
    const syntheticMovements = [
      {
        rowNo: 1,
        entryExit: 'DEBIT' as const,
        rawDate: '10/05/2026',
        tradeDate: '2026-05-10',
        rawMovement: 'Transferência - Liquidação',
        rawProduct: 'VALE3 - VALE S.A.',
        ticker: 'VALE3',
        productName: 'VALE S.A.',
        institution: 'BTG',
        quantity: '50',
        unitPrice: '60.00',
        operationValue: '3000.00',
      },
    ];
    const synthOpening = reconcileOpeningBalances(syntheticMovements);
    expect(synthOpening.length).toBe(1);
    expect(synthOpening[0].ticker).toBe('VALE3');
    expect(synthOpening[0].missingQuantity).toBe('50');

    // Teste sintético: venda entre data-com e data de pagamento (janela de 20 dias) não gera falso déficit
    const safeWindowMovements = [
      // 1. Compra 100 cotas em 01/05
      {
        rowNo: 1,
        entryExit: 'CREDIT' as const,
        rawDate: '01/05/2026',
        tradeDate: '2026-05-01',
        rawMovement: 'Transferência - Liquidação',
        rawProduct: 'KNRI11 - KINEA FII',
        ticker: 'KNRI11',
        productName: 'KINEA FII',
        institution: 'XP',
        quantity: '100',
        unitPrice: '100.00',
        operationValue: '10000.00',
      },
      // 2. Venda de 50 cotas em 05/05
      {
        rowNo: 2,
        entryExit: 'DEBIT' as const,
        rawDate: '05/05/2026',
        tradeDate: '2026-05-05',
        rawMovement: 'Transferência - Liquidação',
        rawProduct: 'KNRI11 - KINEA FII',
        ticker: 'KNRI11',
        productName: 'KINEA FII',
        institution: 'XP',
        quantity: '50',
        unitPrice: '100.00',
        operationValue: '5000.00',
      },
      // 3. Pagamento de rendimento em 15/05 baseado nas 100 cotas da data-com (posição corrente é 50, mas pico nos 20 dias foi 100)
      {
        rowNo: 3,
        entryExit: 'CREDIT' as const,
        rawDate: '15/05/2026',
        tradeDate: '2026-05-15',
        rawMovement: 'Rendimento',
        rawProduct: 'KNRI11 - KINEA FII',
        ticker: 'KNRI11',
        productName: 'KINEA FII',
        institution: 'XP',
        quantity: '100',
        unitPrice: '1.00',
        operationValue: '100.00',
      },
    ];
    const safeWindowBalances = reconcileOpeningBalances(safeWindowMovements);
    expect(safeWindowBalances.length).toBe(0); // Sem falso déficit
  });

  // =========================================================================
  // S46-T10: Planejamento completo de importação (buildImportPlan)
  // =========================================================================
  it('S46-T10: builds import plan matching Appendix B exactly, preserving stable external_ids and decimal totals', () => {
    const plan = buildImportPlan({ rows: rawExampleRows });

    // 1. Contagens do Apêndice B
    expect(plan.summary.totalRowsRead).toBe(33);
    expect(plan.buys.length).toBe(18);
    expect(plan.sells.length).toBe(1);
    expect(plan.incomes.length).toBe(7);
    expect(plan.ignored.length).toBe(7);
    expect(plan.review.length).toBe(0);
    expect(plan.assetsToCreate.length).toBe(16);

    // 2. Totais financeiros em Decimal
    expect(plan.totals.buys.toFixed(2)).toBe('5704.89');
    expect(plan.totals.sells.toFixed(2)).toBe('2445.95');
    expect(plan.totals.incomes.toFixed(2)).toBe('404.78');

    // 3. Ordem cronológica crescente (inverte a ordem mais recente -> mais antiga)
    expect(plan.chronologicalItems[0].tradeDate).toBe('2026-05-15');
    expect(plan.chronologicalItems[plan.chronologicalItems.length - 1].tradeDate).toBe(
      '2026-10-28'
    );

    // 4. ExternalId estável e idempotente
    const plan2 = buildImportPlan({ rows: rawExampleRows });
    expect(plan.buys[0].externalId).toBe(plan2.buys[0].externalId);
    expect(plan.buys[0].externalId).toMatch(/^b3:[a-f0-9]+$/);

    // 5. Linhas idênticas no mesmo dia geram externalIds diferentes por índice n
    const identicalRows = [
      { ...rawExampleRows[0] },
      { ...rawExampleRows[0] }, // Mesma compra de ALUP11 no mesmo dia
    ];
    const planIdentical = buildImportPlan({ rows: identicalRows });
    expect(planIdentical.buys.length).toBe(2);
    expect(planIdentical.buys[0].externalId).not.toBe(planIdentical.buys[1].externalId);

    // 6. Idempotência com existingExternalIds
    const existingIds = new Set(plan.chronologicalItems.map((i) => i.externalId));
    const dedupePlan = buildImportPlan({
      rows: rawExampleRows,
      existingExternalIds: existingIds,
    });
    expect(dedupePlan.duplicates.length).toBe(26); // 18 + 1 + 7 = 26 itens já existentes
    expect(dedupePlan.newItemsCount).toBe(0);
  });
});
