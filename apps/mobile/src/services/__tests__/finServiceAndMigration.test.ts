import { INITIAL_SCHEMA_SQL, SCHEMA_INDEXES_SQL, resetDatabase } from '../../db/client';
import { finRepository, DEFAULT_FIN_CATEGORIES } from '../../repositories/finRepository';
import { finService } from '../finService';
import { calculateAccountBalance } from '../../domain/financeFlow';
import { BackupService, BackupDatabaseSnapshot, IBackupStorageAdapter } from '../backupService';
import type {
  Portfolio,
  PortfolioClassTarget,
  Asset,
  Transaction,
  FinAccount,
  FinCategory,
  FinEntry,
  FinRecurrence,
} from '../../db/schema';

class FinInMemoryBackupAdapter implements IBackupStorageAdapter {
  public snapshot: BackupDatabaseSnapshot;

  constructor(initial?: BackupDatabaseSnapshot) {
    this.snapshot = initial
      ? JSON.parse(JSON.stringify(initial))
      : {
          portfolios: [],
          classTargets: [],
          assets: [],
          transactions: [],
          finAccounts: [],
          finCategories: [],
          finEntries: [],
          finRecurrences: [],
        };
  }

  async getSnapshot(): Promise<BackupDatabaseSnapshot> {
    return JSON.parse(JSON.stringify(this.snapshot));
  }

  async replaceAll(newSnapshot: BackupDatabaseSnapshot): Promise<void> {
    this.snapshot = JSON.parse(JSON.stringify(newSnapshot));
  }

  async mergeByUuid(incoming: BackupDatabaseSnapshot): Promise<void> {
    const mergeList = <T extends { id: string }>(cur: T[] = [], inc: T[] = []): T[] => {
      const map = new Map<string, T>();
      for (const item of cur) map.set(item.id, { ...item });
      for (const item of inc) map.set(item.id, { ...item });
      return Array.from(map.values());
    };
    this.snapshot = {
      portfolios: mergeList<Portfolio>(this.snapshot.portfolios, incoming.portfolios),
      classTargets: mergeList<PortfolioClassTarget>(this.snapshot.classTargets, incoming.classTargets),
      assets: mergeList<Asset>(this.snapshot.assets, incoming.assets),
      transactions: mergeList<Transaction>(this.snapshot.transactions, incoming.transactions),
      finAccounts: mergeList<FinAccount>(this.snapshot.finAccounts, incoming.finAccounts),
      finCategories: mergeList<FinCategory>(this.snapshot.finCategories, incoming.finCategories),
      finEntries: mergeList<FinEntry>(this.snapshot.finEntries, incoming.finEntries),
      finRecurrences: mergeList<FinRecurrence>(this.snapshot.finRecurrences, incoming.finRecurrences),
    };
  }
}

describe('Sprint 54 — FinService, Repositório, Migração e Backup', () => {
  beforeEach(() => {
    resetDatabase();
  });

  describe('Migração aditiva, seed zero e semeadura padrão', () => {
    it('declara tabelas fin_* no SQL inicial e índices em due_date, status e recurrence_id', () => {
      expect(INITIAL_SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS fin_accounts/i);
      expect(INITIAL_SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS fin_categories/i);
      expect(INITIAL_SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS fin_entries/i);
      expect(INITIAL_SCHEMA_SQL).toMatch(/CREATE TABLE IF NOT EXISTS fin_recurrences/i);

      expect(SCHEMA_INDEXES_SQL).toMatch(/fin_entries\s*\(\s*due_date\s*\)/i);
      expect(SCHEMA_INDEXES_SQL).toMatch(/fin_entries\s*\(\s*status\s*\)/i);
      expect(SCHEMA_INDEXES_SQL).toMatch(/fin_entries\s*\(\s*recurrence_id\s*\)/i);
    });

    it('mantém tabelas fin_* vazias após resetDatabase (compatível com Sprint 52 seed zero)', async () => {
      expect(await finRepository.listAccounts(true)).toEqual([]);
      expect(await finRepository.listCategories(true)).toEqual([]);
      expect(await finRepository.listAllEntries()).toEqual([]);
      expect(await finRepository.listRecurrences()).toEqual([]);
    });

    it('semeia categorias padrão pt-BR na primeira abertura de forma idempotente', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const catsFirst = await finRepository.listCategories(true);
      expect(catsFirst.length).toBeGreaterThanOrEqual(DEFAULT_FIN_CATEGORIES.length);

      const names = catsFirst.map((c) => c.name);
      expect(names).toEqual(
        expect.arrayContaining(['Moradia', 'Mercado', 'Transporte', 'Saúde', 'Lazer', 'Assinaturas', 'Salário'])
      );

      // Chamar novamente não deve duplicar
      await finService.initializeFinanceModule('2026-11-13');
      const catsSecond = await finRepository.listCategories(true);
      expect(catsSecond).toHaveLength(catsFirst.length);
    });
  });

  describe('Contas e categorias (CRUD e arquivamento)', () => {
    it('cria, edita e arquiva contas e categorias sem apagar dados históricos', async () => {
      const acc = await finRepository.createAccount({
        name: 'Conta Corrente',
        type: 'checking',
        initialBalanceCents: 250000,
        color: '#2E4A44',
      });
      expect(acc.name).toBe('Conta Corrente');
      expect(acc.initial_balance_cents).toBe(250000);

      const updatedAcc = await finRepository.updateAccount(acc.id, { name: 'Banco Principal' });
      expect(updatedAcc.name).toBe('Banco Principal');

      await finRepository.archiveAccount(acc.id);
      expect(await finRepository.listAccounts(false)).toHaveLength(0);
      expect(await finRepository.listAccounts(true)).toHaveLength(1);

      const cat = await finRepository.createCategory({
        name: 'Educação',
        kind: 'expense',
        icon: 'school',
        color: '#3386B0',
      });
      const updatedCat = await finRepository.updateCategory(cat.id, { name: 'Cursos & Livros' });
      expect(updatedCat.name).toBe('Cursos & Livros');

      await finRepository.archiveCategory(cat.id);
      const activeCats = await finRepository.listCategories(false);
      expect(activeCats.some((c) => c.id === cat.id)).toBe(false);
      const allCats = await finRepository.listCategories(true);
      expect(allCats.some((c) => c.id === cat.id && c.archived === 1)).toBe(true);
    });
  });

  describe('Lançamentos e baixa com valor e data reais', () => {
    it('marca lançamento como pago com valor/data reais diferentes do previsto e reflete no saldo da conta', async () => {
      await finService.initializeFinanceModule('2026-11-13');
      const acc = await finRepository.createAccount({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 100000, // R$ 1.000,00
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catMoradia = cats.find((c) => c.name === 'Moradia')!;

      const entry = await finRepository.createEntry({
        kind: 'expense',
        amount_cents: 15000, // previsto R$ 150,00
        due_date: '2026-11-10',
        paid_date: null,
        paid_amount_cents: null,
        account_id: acc.id,
        category_id: catMoradia.id,
        description: 'Conta de luz',
        recurrence_id: null,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
      });

      const paid = await finService.markEntryAsPaid(entry.id, {
        paidDate: '2026-11-12',
        paidAmountCents: 16250, // pago com juros/variação R$ 162,50
      });

      expect(paid.status).toBe('paid');
      expect(paid.paid_date).toBe('2026-11-12');
      expect(paid.paid_amount_cents).toBe(16250);

      const all = await finRepository.listAllEntries();
      expect(calculateAccountBalance(acc.initial_balance_cents, all, acc.id)).toBe(83750);

      const pendingAgain = await finService.markEntryAsPending(entry.id);
      expect(pendingAgain.status).toBe('pending');
      expect(pendingAgain.paid_date).toBeNull();
      expect(pendingAgain.paid_amount_cents).toBeNull();
    });
  });

  describe('Recorrências preguiçosas e idempotência no banco', () => {
    it('gera janela preguiçosa e atualiza generated_until sem duplicar ao reabrir', async () => {
      await finService.initializeFinanceModule('2026-01-15');
      const acc = await finRepository.createAccount({
        name: 'Banco',
        type: 'checking',
        initialBalanceCents: 0,
        color: '#2E4A44',
      });
      const cats = await finRepository.listCategories();
      const catMoradia = cats.find((c) => c.name === 'Moradia')!;

      const rec = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 200000,
        description: 'Aluguel',
        account_id: acc.id,
        category_id: catMoradia.id,
        frequency: 'monthly',
        day_of_month: 31,
        start_date: '2026-01-31',
        end_date: null,
        is_subscription: 0,
        generated_until: null,
      });

      const firstBatch = await finService.generateRecurrenceWindow('2026-01-01', '2026-03-31');
      expect(firstBatch.map((e) => e.due_date)).toEqual([
        '2026-01-31',
        '2026-02-28',
        '2026-03-31',
      ]);

      const updatedRec = await finRepository.getRecurrenceById(rec.id);
      expect(updatedRec?.generated_until).toBe('2026-03-31');

      // Reabrir na mesma janela não pode duplicar
      const secondBatch = await finService.generateRecurrenceWindow('2026-01-01', '2026-03-31');
      expect(secondBatch).toHaveLength(0);

      const entriesInDb = await finRepository.listEntriesByRecurrence(rec.id);
      expect(entriesInDb).toHaveLength(3);
    });
  });

  describe('Assinaturas: pausar, retomar e cancelar preservando histórico pago', () => {
    it('pausa, retoma e cancela removendo pendentes futuros e preservando pagamentos já efetuados', async () => {
      await finService.initializeFinanceModule('2026-09-01');
      const acc = await finRepository.createAccount({
        name: 'Cartão',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catAssin = cats.find((c) => c.name === 'Assinaturas')!;

      const sub = await finRepository.createRecurrence({
        kind: 'expense',
        amount_cents: 4990,
        description: 'Streaming',
        account_id: acc.id,
        category_id: catAssin.id,
        frequency: 'monthly',
        day_of_month: 10,
        start_date: '2026-09-10',
        end_date: null,
        is_subscription: 1,
        generated_until: null,
      });

      const generated = await finService.generateRecurrenceWindow('2026-09-01', '2026-12-31');
      expect(generated).toHaveLength(4);

      const sep = generated.find((e) => e.due_date === '2026-09-10')!;
      const oct = generated.find((e) => e.due_date === '2026-10-10')!;
      await finService.markEntryAsPaid(sep.id, { paidDate: '2026-09-10', paidAmountCents: 4990 });
      await finService.markEntryAsPaid(oct.id, { paidDate: '2026-10-10', paidAmountCents: 4990 });

      const paused = await finService.pauseSubscription(sub.id);
      expect(paused.active).toBe(0);

      const whilePaused = await finService.generateRecurrenceWindow('2027-01-01', '2027-02-28');
      expect(whilePaused).toHaveLength(0);

      const resumed = await finService.resumeSubscription(sub.id);
      expect(resumed.active).toBe(1);

      const canceled = await finService.cancelSubscription(sub.id, '2026-11-01');
      expect(canceled.active).toBe(0);
      expect(canceled.end_date).toBe('2026-11-01');

      // Histórico pago permanece intacto; pendentes futuros (>= 2026-11-01) foram removidos
      const remaining = await finRepository.listEntriesByRecurrence(sub.id);
      expect(remaining.map((e) => e.due_date).sort()).toEqual(['2026-09-10', '2026-10-10']);
      expect(remaining.every((e) => e.status === 'paid')).toBe(true);
    });
  });

  describe('Parcelamentos: criação e edição/exclusão por escopo', () => {
    it('cria compra em N parcelas e suporta editar/excluir nos 3 escopos (only_this, this_and_next, all)', async () => {
      await finService.initializeFinanceModule('2026-11-01');
      const acc = await finRepository.createAccount({
        name: 'Cartão',
        type: 'card',
        initialBalanceCents: 0,
        color: '#D96628',
      });
      const cats = await finRepository.listCategories();
      const catOutros = cats.find((c) => c.name === 'Outros')!;
      const catLazer = cats.find((c) => c.name === 'Lazer')!;

      const parts = await finService.createInstallmentPurchase({
        kind: 'expense',
        totalAmountCents: 10000, // R$ 100,00 em 4x = 2500 cada
        installmentTotal: 4,
        firstDueDate: '2026-01-15',
        accountId: acc.id,
        categoryId: catOutros.id,
        description: 'Fone Bluetooth',
      });

      expect(parts).toHaveLength(4);
      expect(parts.every((p) => p.installment_group_id === parts[0].installment_group_id)).toBe(true);
      expect(parts.map((p) => `${p.installment_number}/${p.installment_total}`)).toEqual([
        '1/4',
        '2/4',
        '3/4',
        '4/4',
      ]);

      const groupId = parts[0].installment_group_id!;

      // 1. Editar só esta (parcela 2)
      await finService.updateInstallmentEntries(parts[1].id, 'only_this', {
        amount_cents: 3000,
      });
      const afterOnlyThis = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterOnlyThis.find((p) => p.installment_number === 2)?.amount_cents).toBe(3000);
      expect(afterOnlyThis.find((p) => p.installment_number === 3)?.amount_cents).toBe(2500);

      // 2. Editar esta e as próximas (parcela 2, 3, 4 -> não altera parcela 1)
      await finService.updateInstallmentEntries(parts[1].id, 'this_and_next', {
        description: 'Fone Pro',
      });
      const afterThisAndNext = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterThisAndNext.find((p) => p.installment_number === 1)?.description).toBe('Fone Bluetooth');
      expect(afterThisAndNext.find((p) => p.installment_number === 2)?.description).toBe('Fone Pro');
      expect(afterThisAndNext.find((p) => p.installment_number === 4)?.description).toBe('Fone Pro');

      // 3. Editar todas
      await finService.updateInstallmentEntries(parts[1].id, 'all', {
        category_id: catLazer.id,
      });
      const afterAll = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterAll.every((p) => p.category_id === catLazer.id)).toBe(true);

      // 4. Excluir só esta (parcela 2)
      await finService.deleteInstallmentEntries(parts[1].id, 'only_this');
      const afterDeleteOne = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterDeleteOne.map((p) => p.installment_number)).toEqual([1, 3, 4]);

      // 5. Excluir esta e as próximas (parcela 3 -> remove 3 e 4, mantém 1)
      await finService.deleteInstallmentEntries(parts[2].id, 'this_and_next');
      const afterDeleteNext = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterDeleteNext.map((p) => p.installment_number)).toEqual([1]);

      // 6. Excluir todas
      await finService.deleteInstallmentEntries(parts[0].id, 'all');
      const afterDeleteAll = await finRepository.listEntriesByInstallmentGroup(groupId);
      expect(afterDeleteAll).toEqual([]);
    });
  });

  describe('Backup .celsus.zip cobrindo tabelas fin_*', () => {
    it('exporta e restaura dados das tabelas fin_* preservando integridade SHA-256', async () => {
      const snapshot: BackupDatabaseSnapshot = {
        portfolios: [],
        classTargets: [],
        assets: [],
        transactions: [],
        finAccounts: [
          {
            id: 'acc-b1',
            name: 'Nubank',
            type: 'checking',
            initial_balance_cents: 150000,
            color: '#A958E4',
            archived: 0,
            created_at: '2026-11-01T00:00:00.000Z',
          },
        ],
        finCategories: [
          {
            id: 'cat-b1',
            name: 'Mercado',
            kind: 'expense',
            icon: 'shopping-cart',
            color: '#2E4A44',
            parent_id: null,
            archived: 0,
          },
        ],
        finEntries: [
          {
            id: 'ent-b1',
            kind: 'expense',
            amount_cents: 25000,
            due_date: '2026-11-10',
            paid_date: '2026-11-10',
            paid_amount_cents: 25000,
            status: 'paid',
            account_id: 'acc-b1',
            category_id: 'cat-b1',
            description: 'Supermercado',
            recurrence_id: null,
            installment_group_id: null,
            installment_number: null,
            installment_total: null,
            created_at: '2026-11-10T00:00:00.000Z',
          },
        ],
        finRecurrences: [
          {
            id: 'rec-b1',
            kind: 'expense',
            amount_cents: 3990,
            description: 'Música',
            account_id: 'acc-b1',
            category_id: 'cat-b1',
            frequency: 'monthly',
            day_of_month: 5,
            start_date: '2026-11-05',
            end_date: null,
            is_subscription: 1,
            active: 1,
            generated_until: '2026-11-30',
            created_at: '2026-11-01T00:00:00.000Z',
          },
        ],
      };

      const sourceAdapter = new FinInMemoryBackupAdapter(snapshot);
      const sourceService = new BackupService(sourceAdapter);
      const exported = await sourceService.exportDossierArchive();

      const extracted = BackupService.extractZipArchive(exported.zipBytes);
      expect(extracted['fin_accounts.csv']).toBeDefined();
      expect(extracted['fin_categories.csv']).toBeDefined();
      expect(extracted['fin_entries.csv']).toBeDefined();
      expect(extracted['fin_recurrences.csv']).toBeDefined();

      const targetAdapter = new FinInMemoryBackupAdapter();
      const targetService = new BackupService(targetAdapter);
      await targetService.importDossierArchive(exported.zipBytes, 'RESTORE');

      const restored = await targetAdapter.getSnapshot();
      expect(restored.finAccounts).toHaveLength(1);
      expect(restored.finCategories).toHaveLength(1);
      expect(restored.finEntries).toHaveLength(1);
      expect(restored.finRecurrences).toHaveLength(1);
      expect(restored.finEntries![0].description).toBe('Supermercado');
    });
  });
});
