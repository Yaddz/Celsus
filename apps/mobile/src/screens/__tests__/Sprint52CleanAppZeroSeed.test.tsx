import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { AUVP_SEED_FLAG, spreadsheetImportService } from '../../services/spreadsheetImportService';

describe('Sprint 52 - Clean App Zero Seed and Empty State', () => {
  beforeEach(async () => {
    resetDatabase();
  });

  it('S52-T1: inicia com zero carteiras, zero ativos, zero transações e zero proventos no banco de dados limpo', async () => {
    const ports = await portfolioRepository.listPortfolios(true);
    expect(ports).toEqual([]);

    const txs = await transactionRepository.getAllTransactions();
    expect(txs).toEqual([]);

    const incomes = await incomeRepository.listAllIncomes();
    expect(incomes).toEqual([]);
  });

  it('S52-T2: renderiza a Home no estado limpo sem carteiras pré-cadastradas e exibe chamada para criar primeira carteira', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Nenhuma carteira cadastrada')).toBeTruthy();
      expect(screen.getByText('Criar primeira carteira')).toBeTruthy();
    });

    // Garante que a carteira AUVP não foi criada automaticamente
    const ports = await portfolioRepository.listPortfolios(true);
    expect(ports.some((p) => p.name === 'AUVP')).toBe(false);
    expect(ports.length).toBe(0);
  });

  it('S52-T3: resetDatabase apaga todos os dados e não mantém chaves residuais de seed em app_meta', async () => {
    await appMetaRepository.set('custom:key', '123');
    await appMetaRepository.set(AUVP_SEED_FLAG, '2026-11-08');

    resetDatabase();

    const customVal = await appMetaRepository.get('custom:key');
    expect(customVal).toBeNull();

    const seedVal = await appMetaRepository.get(AUVP_SEED_FLAG);
    expect(seedVal).toBeNull();
  });

  it('S52-T4: app inicial não possui nenhuma movimentação fictícia nos lançamentos', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('R$ 0,00')).toBeTruthy();
    });

    const txs = await transactionRepository.getAllTransactions();
    expect(txs.length).toBe(0);
  });
});
