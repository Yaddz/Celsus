import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Asset, FinAccount } from '../db/schema';
import { formatCentsBRL, getTodayIsoLocal } from '../domain/financeFlow';
import {
  collectAppNumbers,
  computePluggyTruth,
  reconcileAppVsPluggy,
  type Difference,
  type DifferenceReason,
  type PluggyTruthResult,
} from '../domain/openFinance/pluggyTruth';
import { toBrtDate } from '../domain/openFinance/dates';
import { assetRepository } from '../repositories/assetRepository';
import { finRepository } from '../repositories/finRepository';
import { openFinanceRepository } from '../repositories/openFinanceRepository';
import { PluggyClient } from '../services/pluggy/pluggyClient';
import type { PluggyBill, PluggyInvestment, PluggyTransaction } from '../services/pluggy/types';
import { THEME_COLORS, ThemeMode } from '../theme/palettes';
import { space } from '../theme/tokens';

export interface OpenFinanceReconciliationScreenProps {
  onClose?: () => void;
  themeMode?: ThemeMode;
  client?: PluggyClient;
  onCopyReport?: (text: string) => void | Promise<void>;
  now?: () => Date;
  testID?: string;
}

const REASON_PT_BR: Record<DifferenceReason, string> = {
  ITEMS_VS_TOTAL: 'Itens do app diferem da fatura do banco',
  APP_RECOMPUTED: 'Valor recalculado no app difere da instituição',
  MISSING_BILL: 'Fatura ausente no banco local',
  SIGN_MISMATCH: 'Sinal de transação divergente',
  COUNT_MISMATCH: 'Quantidade de lançamentos divergente',
};

interface ItemReconciliationView {
  connectorName: string;
  truth: PluggyTruthResult;
  diffs: Difference[];
  appTxCountByAccountId: Record<string, number>;
  investments: PluggyInvestment[];
}

export const OpenFinanceReconciliationScreen: React.FC<
  OpenFinanceReconciliationScreenProps
> = ({
  onClose,
  themeMode = 'dark',
  client,
  onCopyReport,
  now = () => new Date(),
  testID = 'of-reconciliation-screen',
}) => {
  const t = THEME_COLORS[themeMode];
  const pluggyClient = useMemo(() => client ?? new PluggyClient(), [client]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemViews, setItemViews] = useState<ItemReconciliationView[]>([]);
  const [ofAssets, setOfAssets] = useState<Asset[]>([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const todayIso = toBrtDate(now().toISOString()) || getTodayIsoLocal();
        const [items, localAccounts, localEntries, localBills, allAssets] = await Promise.all([
          openFinanceRepository.listItems(),
          finRepository.listAccounts(true),
          finRepository.listAllEntries(),
          finRepository.listAllBills(),
          assetRepository.listAll(),
        ]);

        const appNumbers = collectAppNumbers({
          accounts: localAccounts,
          entries: localEntries,
          bills: localBills,
          todayIso,
        });

        const appTxCountByOfAcc: Record<string, number> = {};
        const accById = new Map<string, FinAccount>(
          localAccounts.map((a: FinAccount) => [a.id, a])
        );
        for (const e of localEntries) {
          if (e.of_removed_at) continue;
          const acc = accById.get(e.account_id);
          if (acc?.of_account_id) {
            appTxCountByOfAcc[acc.of_account_id] = (appTxCountByOfAcc[acc.of_account_id] ?? 0) + 1;
          }
        }

        const views: ItemReconciliationView[] = [];
        for (const itemRecord of items) {
          const item = await pluggyClient.getItem(itemRecord.id);
          const accounts = await pluggyClient.listAccounts(itemRecord.id);
          const transactionsByAccount: Record<string, PluggyTransaction[]> = {};
          const billsByAccount: Record<string, PluggyBill[]> = {};
          for (const acc of accounts) {
            transactionsByAccount[acc.id] = await pluggyClient.listTransactions(acc.id);
            if (acc.type === 'CREDIT') {
              billsByAccount[acc.id] = await pluggyClient.listBills(acc.id);
            }
          }
          let investments: PluggyInvestment[] = [];
          try {
            if (typeof pluggyClient.listInvestments === 'function') {
              investments = await pluggyClient.listInvestments(itemRecord.id);
            }
          } catch {
            investments = [];
          }

          const truth = computePluggyTruth(
            {
              item,
              accounts,
              transactionsByAccount,
              billsByAccount,
              investments,
            },
            todayIso
          );
          const diffs = reconcileAppVsPluggy(truth, appNumbers);
          for (const cardAcc of accounts.filter((a) => a.type === 'CREDIT')) {
            const localCard = localAccounts.find((la) => la.of_account_id === cardAcc.id);
            if (!localCard) continue;
            const cardBills = localBills.filter((b) => b.account_id === localCard.id);
            for (const lb of cardBills) {
              const billEntries = localEntries.filter(
                (e) =>
                  e.account_id === localCard.id &&
                  !e.of_removed_at &&
                  e.kind === 'expense' &&
                  ((lb.external_id && e.of_bill_id === lb.external_id) ||
                    (!e.of_bill_id && e.bill_month === lb.bill_month))
              );
              const hasRemovedBillEntry = localEntries.some(
                (e) =>
                  e.account_id === localCard.id &&
                  Boolean(e.of_removed_at) &&
                  ((lb.external_id && e.of_bill_id === lb.external_id) ||
                    e.bill_month === lb.bill_month)
              );
              if (billEntries.length > 0 || hasRemovedBillEntry) {
                const appItemsCents = billEntries.reduce((s, e) => s + e.amount_cents, 0);
                if (appItemsCents !== lb.total_amount_cents) {
                  const key = `${cardAcc.id}:${lb.bill_month}:items`;
                  if (!diffs.some((d) => d.key === key)) {
                    diffs.push({
                      scope: 'BILL',
                      key,
                      pluggyCents: lb.total_amount_cents,
                      appCents: appItemsCents,
                      diffCents: appItemsCents - lb.total_amount_cents,
                      reason: 'ITEMS_VS_TOTAL',
                    });
                  }
                }
              }
            }
          }
          views.push({
            connectorName: itemRecord.connector_name || item.connector?.name || 'Conexão',
            truth,
            diffs,
            appTxCountByAccountId: appTxCountByOfAcc,
            investments,
          });
        }

        if (!active) return;
        setItemViews(views);
        setOfAssets(
          allAssets.filter(
            (a: Asset) =>
              a.source === 'OPEN_FINANCE' ||
              Boolean(a.of_reported_value) ||
              Boolean((a as unknown as { of_investment_id?: string }).of_investment_id)
          )
        );
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erro ao conferir com o Meu Pluggy.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [pluggyClient, now]);

  const totalDiffs = itemViews.reduce((s, v) => s + v.diffs.length, 0);

  const investSummary = useMemo(() => {
    const pluggyInvById = new Map<string, PluggyInvestment>();
    for (const v of itemViews) {
      for (const inv of v.investments) {
        pluggyInvById.set(inv.id, inv);
      }
    }

    let pluggyCents = 0;
    let appCents = 0;
    const rows: Array<{
      ticker: string;
      pluggyCents: number;
      appCents: number;
      ledgerQty: number | null;
      pluggyQty: number | null;
    }> = [];

    for (const a of ofAssets) {
      const ext = a as unknown as {
        of_investment_id?: string;
        current_price?: string | null;
        of_reported_quantity?: string | number | null;
      };
      const pInv =
        (ext.of_investment_id ? pluggyInvById.get(ext.of_investment_id) : undefined) ??
        Array.from(pluggyInvById.values()).find(
          (inv) => (inv.code ?? '').toUpperCase() === a.ticker.toUpperCase()
        );
      const pVal = a.of_reported_value
        ? Math.round(Number(a.of_reported_value) * 100)
        : pInv?.balance != null
        ? Math.round(pInv.balance * 100)
        : 0;
      const qty = Number(a.quantity || 0);
      const rawPrice =
        ext.current_price ??
        a.manual_price_override ??
        a.average_price ??
        '0';
      const price = Number(rawPrice);
      const aVal = Math.round(qty * price * 100);
      pluggyCents += pVal;
      appCents += aVal;
      const rawPluggyQty = pInv?.quantity ?? ext.of_reported_quantity;
      const pQty = rawPluggyQty != null ? Number(rawPluggyQty) : null;
      rows.push({
        ticker: a.ticker,
        pluggyCents: pVal,
        appCents: aVal,
        ledgerQty: Number.isFinite(qty) ? qty : null,
        pluggyQty: pQty !== null && Number.isFinite(pQty) ? pQty : null,
      });
    }

    if (pluggyCents === 0) {
      for (const v of itemViews) {
        pluggyCents += v.truth.totals.investmentsCents;
      }
    }

    return {
      pluggyCents,
      appCents,
      diffCents: appCents - pluggyCents,
      rows,
    };
  }, [ofAssets, itemViews]);

  const handleExport = async () => {
    const lines: string[] = [
      'Conferência Meu Pluggy × Celsus (anonimizada)',
      `Diferenças financeiras: ${totalDiffs}`,
    ];
    for (const v of itemViews) {
      lines.push(`Conexão: ${v.connectorName}`);
      lines.push(
        `Totais Pluggy: contas=${formatCentsBRL(v.truth.totals.bankTotalCents)} | cartões=${formatCentsBRL(v.truth.totals.cardsDebtCents)} (${v.truth.totals.cardsUsagePct}%) | futuros=${formatCentsBRL(v.truth.totals.pendingOutflowCents)}`
      );
      for (const d of v.diffs) {
        lines.push(
          `DIFF [${d.scope}] ${d.key}: pluggy=${formatCentsBRL(d.pluggyCents)} app=${formatCentsBRL(d.appCents)} motivo=${REASON_PT_BR[d.reason]}`
        );
      }
    }
    if (investSummary.pluggyCents > 0 || investSummary.appCents > 0) {
      lines.push(
        `Investimentos (informativo): Pluggy=${formatCentsBRL(investSummary.pluggyCents)} Celsus=${formatCentsBRL(investSummary.appCents)}`
      );
    }
    const text = lines.join('\n');
    if (onCopyReport) {
      await onCopyReport(text);
    } else {
      await Share.share({ message: text });
    }
  };

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={t.onSurface} />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.title, { color: t.onSurface }]}>
          Conferir com o Meu Pluggy
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={[styles.caption, { color: t.muted }]}>Carregando conferência...</Text>
        ) : error ? (
          <Text style={[styles.caption, { color: t.error }]}>{error}</Text>
        ) : (
          <>
            <View
              testID="of-reconcile-summary"
              style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
            >
              <Text style={[styles.cardTitle, { color: totalDiffs === 0 ? t.accent : t.error }]}>
                {totalDiffs === 0
                  ? 'Todas as contas e faturas batem ✓'
                  : `${totalDiffs} diferença(s) encontrada(s)`}
              </Text>
              {itemViews.flatMap((v) => v.diffs).map((d, idx) => (
                <View key={`${d.key}-${idx}`} style={styles.diffRow}>
                  <Text style={[styles.caption, { color: t.onSurface }]}>
                    {`${d.key} · Pluggy ${formatCentsBRL(d.pluggyCents)} | Celsus ${formatCentsBRL(d.appCents)} (dif. ${formatCentsBRL(d.diffCents)})`}
                  </Text>
                  <Text style={[styles.caption, { color: t.error }]}>
                    {REASON_PT_BR[d.reason]}
                  </Text>
                </View>
              ))}
            </View>

            {itemViews.map((v, idx) => (
              <View
                key={`${v.connectorName}-${idx}`}
                style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Text style={[styles.cardTitle, { color: t.onSurface }]}>{v.connectorName}</Text>
                <Text style={[styles.caption, { color: t.muted }]}>
                  {`Como no Meu Pluggy: Contas ${formatCentsBRL(v.truth.totals.bankTotalCents)} · Cartões ${formatCentsBRL(v.truth.totals.cardsDebtCents)} (${v.truth.totals.cardsUsagePct}% usado) · Despesas futuras ${formatCentsBRL(v.truth.totals.pendingOutflowCents)}`}
                </Text>

                {Object.values(v.truth.bankAccounts).map((b) => (
                  <View key={b.accountId} style={styles.subRow}>
                    <Text style={[styles.caption, { color: t.onSurface }]}>
                      {`Conta: Saldo ${formatCentsBRL(b.availableCents)} · Em processamento ${formatCentsBRL(b.processingCents)} · Agendado −${formatCentsBRL(b.scheduled.toPayCents)} / +${formatCentsBRL(b.scheduled.toReceiveCents)}`}
                    </Text>
                    <Text style={[styles.caption, { color: t.muted }]}>
                      {`Transações: Pluggy ${v.truth.totals.txCountByAccount[b.accountId] ?? 0} | Celsus ${v.appTxCountByAccountId[b.accountId] ?? 0}`}
                    </Text>
                  </View>
                ))}

                {Object.values(v.truth.cardAccounts).map((c) => (
                  <View key={c.accountId} style={styles.subRow}>
                    <Text style={[styles.caption, { color: t.onSurface }]}>
                      {`Cartão: Usado ${formatCentsBRL(c.usedCents)} · Disponível ${c.availableCents !== null ? formatCentsBRL(c.availableCents) : '—'} · Fatura atual ${formatCentsBRL(c.openBill)}`}
                    </Text>
                    <Text style={[styles.caption, { color: t.muted }]}>
                      {`Transações: Pluggy ${v.truth.totals.txCountByAccount[c.accountId] ?? 0} | Celsus ${v.appTxCountByAccountId[c.accountId] ?? 0}`}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            {investSummary.pluggyCents > 0 || investSummary.appCents > 0 ? (
              <View
                testID="of-reconcile-investments"
                style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <Text style={[styles.cardTitle, { color: t.onSurface }]}>
                  Investimentos (informativo)
                </Text>
                <Text style={[styles.caption, { color: t.onSurface }]}>
                  {`Como no Meu Pluggy ${formatCentsBRL(investSummary.pluggyCents)} · Celsus ${formatCentsBRL(investSummary.appCents)} · Diferença ${formatCentsBRL(investSummary.diffCents)} · Cotação de mercado mais recente`}
                </Text>
                {investSummary.rows.map((r) => (
                  <View key={r.ticker} style={styles.subRow}>
                    <Text style={[styles.caption, { color: t.muted }]}>
                      {`${r.ticker}: Instituição ${formatCentsBRL(r.pluggyCents)} | Celsus ${formatCentsBRL(r.appCents)}`}
                    </Text>
                    {r.ledgerQty !== null &&
                    r.pluggyQty !== null &&
                    r.ledgerQty !== r.pluggyQty ? (
                      <Text style={[styles.caption, { color: t.warning }]}>
                        {`Livro ${r.ledgerQty} cotas × instituição ${r.pluggyQty} (${r.ledgerQty - r.pluggyQty})`}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              testID="of-reconcile-export-btn"
              onPress={() => void handleExport()}
              style={[styles.exportBtn, { backgroundColor: t.accent }]}
            >
              <Text style={[styles.exportBtnText, { color: t.onAccent }]}>
                Exportar conferência
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    gap: space.sm,
  },
  backBtn: { padding: space.xs },
  title: { fontSize: 20, fontWeight: '700' },
  content: { padding: space.md, gap: space.md },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
    gap: space.xs,
  },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 13 },
  diffRow: { marginTop: space.xs, gap: 2 },
  subRow: { marginTop: space.xs, gap: 2 },
  exportBtn: {
    borderRadius: 12,
    paddingVertical: space.sm,
    alignItems: 'center',
  },
  exportBtnText: { fontSize: 15, fontWeight: '600' },
});

export default OpenFinanceReconciliationScreen;
