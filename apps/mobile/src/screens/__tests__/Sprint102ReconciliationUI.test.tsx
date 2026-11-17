import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import { buildPluggyRealSnapshot } from '../../services/pluggy/__tests__/pluggyRealSnapshot';
import { OpenFinanceScreen } from '../OpenFinanceScreen';
import { OpenFinanceReconciliationScreen } from '../OpenFinanceReconciliationScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';

describe('Sprint 102 — Saúde da conexão, consentimento, FAB único e Conferência Meu Pluggy', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S102-T03: banners de consentimento (amarelo <=30d, vermelho vencido/USER_AUTHORIZATION_EXPIRED com passo MeuPluggy)', async () => {
    const soonIso = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    await openFinanceRepository.upsertItem({
      id: 'item-soon',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: soonIso,
      last_updated_at: '2026-11-17T09:12:00.000Z',
    });

    const pastIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await openFinanceRepository.upsertItem({
      id: 'item-expired',
      connector_name: 'Nubank',
      status: 'UPDATED',
      execution_status: 'USER_AUTHORIZATION_EXPIRED',
      consent_expires_at: pastIso,
      error_code: 'USER_AUTHORIZATION_EXPIRED',
      last_updated_at: '2026-11-17T09:12:00.000Z',
    });

    render(<OpenFinanceScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Dados do Meu Pluggy de 17\/11 às 06:12/i)).toBeTruthy();
    });
    expect(screen.getByText(/O Meu Pluggy atualiza seus bancos a cada 24 h/i)).toBeTruthy();
    expect(screen.getByTestId('of-consent-warning-item-soon')).toBeTruthy();
    expect(screen.getByTestId('of-consent-expired-item-expired')).toBeTruthy();
    expect(screen.getByText(/escolha MeuPluggy, não o seu banco/i)).toBeTruthy();
  });

  it('S102-T04, S102-T09, S102-T10 & S102-T11: tela de conferência bate 100% com pluggyRealSnapshot e exibe D46/D47 informativos', async () => {
    const snap = buildPluggyRealSnapshot();
    await openFinanceRepository.addItem(snap.item.id);
    await pluggySyncService.syncFinance(snap.item.id, {
      client: snap.client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    // D46/D47: carteira com MXRF11 (625 cotas no livro, cotação R$ 8,81608 -> 5510,05) + RF 3582,34 = 9092,39
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'CART-01',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'MXRF11',
      name: 'MAXI RENDA FII',
      asset_class: 'FII',
      quantity: '625',
      average_price: '8.80',
      current_price: '8.81608',
      of_investment_id: 'inv-mxrf11',
      of_reported_value: '5465.46',
      of_reported_quantity: '637',
    } as any);
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'CDB-LIQ',
      name: 'CDB Liquidez Diária',
      asset_class: 'RENDA_FIXA',
      quantity: '1',
      average_price: '3582.34',
      current_price: '3582.34',
      of_investment_id: 'inv-rf-1',
      of_reported_value: '3632.75',
      of_reported_quantity: '1',
    } as any);

    render(
      <OpenFinanceReconciliationScreen
        client={snap.client}
        now={() => new Date('2026-11-17T12:00:00Z')}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('of-reconcile-summary')).toBeTruthy();
    });
    expect(screen.getByText(/Todas as contas e faturas batem/i)).toBeTruthy();
    expect(screen.getByText(/Como no Meu Pluggy R\$\s*9\.098,21/i)).toBeTruthy();
    expect(screen.getByText(/Celsus R\$\s*9\.092,39/i)).toBeTruthy();
    expect(screen.getByText(/Cotação de mercado mais recente/i)).toBeTruthy();
    expect(screen.getByText(/Livro 625 cotas × instituição 637 \(-12\)/i)).toBeTruthy();
  });

  it('S102-T05 & S102-T06: remoção local acusa diferença em R$ + motivo e exportar conferência é sem PII', async () => {
    const snap = buildPluggyRealSnapshot();
    await openFinanceRepository.addItem(snap.item.id);
    await pluggySyncService.syncFinance(snap.item.id, {
      client: snap.client,
      now: () => new Date('2026-11-17T12:00:00Z'),
    });

    // Remover à mão o lançamento da fatura fechada
    const entries = await finRepository.listAllEntries();
    const closedItem = entries.find((e) => e.external_id === 'tx-c1');
    expect(closedItem).toBeTruthy();
    await finRepository.updateEntry(closedItem!.id, {
      of_removed_at: '2026-11-17T12:00:00.000Z',
    });

    let exported = '';
    render(
      <OpenFinanceReconciliationScreen
        client={snap.client}
        now={() => new Date('2026-11-17T12:00:00Z')}
        onCopyReport={(txt) => {
          exported = txt;
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Itens do app diferem da fatura do banco/i)).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('of-reconcile-export-btn'));
    await waitFor(() => {
      expect(exported.length).toBeGreaterThan(20);
    });
    expect(exported).not.toMatch(/owner|taxNumber|item-7ccce4de-real/i);
  });

  it('S102-T08: D42 — Contas e Lançamentos dentro do FinanceHomeScreen renderizam exatamente 1 FAB visível', async () => {
    render(<FinanceHomeScreen referenceDateIso="2026-11-17" />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-dock')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('finance-dock-tab-accounts'));
    await waitFor(() => {
      expect(screen.getByTestId('accounts-screen')).toBeTruthy();
    });
    expect(screen.getAllByText('add')).toHaveLength(1);

    fireEvent.press(screen.getByTestId('finance-dock-tab-entries'));
    await waitFor(() => {
      expect(screen.getByTestId('entries-list-screen')).toBeTruthy();
    });
    expect(screen.getAllByText('add')).toHaveLength(1);
  });
});
