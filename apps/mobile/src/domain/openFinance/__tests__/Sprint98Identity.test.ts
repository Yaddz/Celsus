import {
  computeFetchedFingerprints,
  matchFetchedToExisting,
  transactionFingerprint,
  type ExistingMatchCandidate,
  type FetchedMatchCandidate,
} from '../identity';

describe('Sprint 98 — Identidade estável e impressão digital (R31)', () => {
  it('S98-T01: duas compras idênticas no mesmo dia recebem ordinais 0 e 1; terceira em outro dia recebe ordinal 0', () => {
    const items: FetchedMatchCandidate[] = [
      {
        externalId: 'tx-renovapay-2',
        accountId: 'acc-1',
        date: '2026-11-12T14:00:00.000Z',
        absAmountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 1,
      },
      {
        externalId: 'tx-renovapay-1',
        accountId: 'acc-1',
        date: '2026-11-12T12:00:00.000Z',
        absAmountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 0,
      },
      {
        externalId: 'tx-renovapay-3',
        accountId: 'acc-1',
        date: '2026-11-13T12:00:00.000Z',
        absAmountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 0,
      },
    ];

    const fps = computeFetchedFingerprints(items);
    expect(fps).toHaveLength(3);
    expect(fps[0]).toMatch(/\|1$/);
    expect(fps[1]).toMatch(/\|0$/);
    expect(fps[0]).not.toBe(fps[1]);
    expect(fps[2]).toMatch(/\|0$/);
    expect(fps[2]).not.toBe(fps[1]);

    const direct = transactionFingerprint(
      {
        id: 'tx-renovapay-1',
        accountId: 'acc-1',
        date: '2026-11-12T12:00:00.000Z',
        amountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 0,
      },
      0
    );
    expect(direct).toBe(fps[1]);
  });

  it('S98-T05: mudança de descrição com id novo não casa por fingerprint (transação nova)', () => {
    const fetched: FetchedMatchCandidate[] = [
      {
        externalId: 'tx-ifood-new',
        accountId: 'acc-1',
        date: '2026-11-14T12:00:00.000Z',
        absAmountCents: 4590,
        description: 'IFOOD',
        ofProviderId: null,
        order: 0,
      },
    ];
    const existing: ExistingMatchCandidate[] = [
      {
        id: 'ent-ifood-old',
        account_id: 'acc-1',
        external_id: 'tx-ifood-old',
        of_provider_id: null,
        of_raw_amount_cents: null,
        amount_cents: 4590,
        due_date: '2026-11-14',
        description: 'Ifood.com Agencia...',
        description_raw: 'IFOOD.COM AGENCIA DE RESTAURANTES',
      },
    ];

    const results = matchFetchedToExisting(fetched, existing);
    expect(results).toEqual([{ action: 'create', matchedBy: null }]);
  });

  it('S98-T11: dois buscados idênticos e um existente => um update e um create (existente não casa duas vezes)', () => {
    const fetched: FetchedMatchCandidate[] = [
      {
        externalId: 'tx-dup-new-1',
        accountId: 'acc-1',
        date: '2026-11-12T12:00:00.000Z',
        absAmountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 0,
      },
      {
        externalId: 'tx-dup-new-2',
        accountId: 'acc-1',
        date: '2026-11-12T14:00:00.000Z',
        absAmountCents: 1042,
        description: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
        order: 1,
      },
    ];
    // Existente antigo (sem of_raw_amount_cents nem of_provider_id: usa fallback amount_cents/due_date/description_raw)
    const existing: ExistingMatchCandidate[] = [
      {
        id: 'ent-old-1',
        account_id: 'acc-1',
        external_id: 'tx-dup-old-1',
        of_provider_id: null,
        of_raw_amount_cents: null,
        amount_cents: 1042,
        due_date: '2026-11-12',
        description: 'Renovapay Servicos De Pagaementos Ltda',
        description_raw: 'RENOVAPAY SERVICOS DE PAGAEMENTOS LTDA',
      },
    ];

    const results = matchFetchedToExisting(fetched, existing);
    expect(results[0]).toEqual({
      action: 'update',
      existingId: 'ent-old-1',
      matchedBy: 'FINGERPRINT',
    });
    expect(results[1]).toEqual({
      action: 'create',
      matchedBy: null,
    });
  });
});
