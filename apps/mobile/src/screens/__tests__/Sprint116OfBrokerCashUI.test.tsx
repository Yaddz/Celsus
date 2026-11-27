import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { getDatabase, initializeDatabase, resetDatabase } from '../../db/client';
import { assets, finAccounts, finEntries, portfolios } from '../../db/schema';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import {
  brokerExportTxs,
  makeSprint116Client,
  SPRINT116_NOW,
} from '../../services/pluggy/__tests__/sprint116ExportFixture';
import { SimulatorScreen } from '../SimulatorScreen';
import { TransactionScreen } from '../TransactionScreen';

const ITEM = 'item-s116-ui';
const PG_BANK = 'pg-s116-ui-bank';
const PG_BROKER = 'pg-s116-ui-broker';

async function setup(linkTo: 'OF' | 'MANUAL') {
  await openFinanceRepository.addItem(ITEM);
  await pluggySyncService.syncFinance(ITEM, {
    client: makeSprint116Client(
      ITEM,
      [
        { pgId: PG_BANK, name: 'Conta Corrente', balance: 0 },
        { pgId: PG_BROKER, name: 'Conta Corretora', balance: 14.25 },
      ],
      brokerExportTxs(PG_BROKER)
    ),
    now: () => SPRINT116_NOW,
  });
  const accounts = await finRepository.listAccounts(true);
  const ofBroker = accounts.find((a) => a.of_account_id === PG_BROKER)!;
  const ofBank = accounts.find((a) => a.of_account_id === PG_BANK)!;
  const manualBroker = await finRepository.createAccount({ name: 'Corretora Manual', type: 'broker', initialBalanceCents: 0 });
  const linkedAccount = linkTo === 'OF' ? ofBroker : manualBroker;
  const portfolio = await portfolioRepository.createPortfolio({ name: 'Carteira UI', targetReturn: '12', ofItemId: ITEM });
  await portfolioRepository.linkFinAccount(portfolio.id, linkedAccount.id);
  const asset = await assetRepository.createAsset({
    portfolio_id: portfolio.id,
    ticker: 'HGLG11',
    name: 'HGLG11',
    asset_class: 'STOCK',
    quantity: '10',
    average_price: '30.00',
    target_percentage_in_class: 100,
  });
  return { ofBroker, ofBank, manualBroker, portfolio, asset };
}

describe('Sprint 116 — UI: conta vinculada Open Finance (W1c)', () => {
  beforeEach(async () => {
    resetDatabase();
    await initializeDatabase();
    const db = getDatabase();
    await db.delete(finEntries);
    await db.delete(assets);
    await db.delete(portfolios);
    await db.delete(finAccounts);
  });

  test('S116-T30 (W1c): TransactionScreen com conta OF troca "Sai de" pelo texto do extrato, sem chips e sem aviso de saldo', async () => {
    const { ofBroker, ofBank, portfolio, asset } = await setup('OF');
    const screen = await render(
      <TransactionScreen initialPortfolioId={portfolio.id} initialAssetId={asset.id} onClose={jest.fn()} onTransactionSuccess={jest.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('tx-of-cash-note')).toBeTruthy();
    });
    expect(
      screen.getByText(`O dinheiro desta carteira vem do extrato da ${ofBroker.name} (Open Finance).`)
    ).toBeTruthy();
    expect(screen.queryByText('Sai de')).toBeNull();
    expect(screen.queryByTestId(`cash-source-chip-${ofBroker.id}`)).toBeNull();
    expect(screen.queryByTestId(`cash-source-chip-${ofBank.id}`)).toBeNull();
    expect(screen.queryByTestId('cash-projected-balance')).toBeNull();
    expect(screen.queryByTestId('cash-negative-warning')).toBeNull();
  });

  test('S116-T31 (W1c): TransactionScreen com conta broker manual mantém chips, saldo projetado e não mostra o texto do extrato', async () => {
    const { manualBroker, portfolio, asset } = await setup('MANUAL');
    const screen = await render(
      <TransactionScreen initialPortfolioId={portfolio.id} initialAssetId={asset.id} onClose={jest.fn()} onTransactionSuccess={jest.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByTestId(`cash-source-chip-${manualBroker.id}`)).toBeTruthy();
    });
    expect(screen.getByTestId('cash-projected-balance')).toBeTruthy();
    expect(screen.queryByTestId('tx-of-cash-note')).toBeNull();
  });

  test('S116-T32 (W1c): SimulatorScreen com conta OF troca o bloco "Sai de" pelo texto do extrato; com conta manual mantém o bloco', async () => {
    const { ofBroker, portfolio } = await setup('OF');
    const screen = await render(
      <SimulatorScreen initialPortfolioId={portfolio.id} initialAmount="962,50" onClose={jest.fn()} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('sim-of-cash-note')).toBeTruthy();
    });
    expect(
      screen.getByText(`O dinheiro desta carteira vem do extrato da ${ofBroker.name} (Open Finance).`)
    ).toBeTruthy();
    expect(screen.queryByTestId('sim-cash-source-block')).toBeNull();
    expect(screen.queryByTestId('sim-cash-negative-warning')).toBeNull();
    screen.unmount();

    // mesma carteira religada a uma conta manual: bloco "Sai de" de volta
    const manual = await finRepository.createAccount({ name: 'Corretora Nova', type: 'broker', initialBalanceCents: 0 });
    await portfolioRepository.linkFinAccount(portfolio.id, manual.id);
    const screen2 = await render(
      <SimulatorScreen initialPortfolioId={portfolio.id} initialAmount="962,50" onClose={jest.fn()} />
    );
    await waitFor(() => {
      expect(screen2.getByTestId('sim-cash-source-block')).toBeTruthy();
    });
    expect(screen2.queryByTestId('sim-of-cash-note')).toBeNull();
  });
});
