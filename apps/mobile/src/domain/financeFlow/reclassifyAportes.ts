import type { FinAccount, FinEntry } from '../../db/schema';

export interface AporteExpenseCandidate {
  entry: FinEntry;
  matchedKeyword: string;
}

const APORTE_KEYWORDS = [
  'aporte',
  'corretora',
  'investimento',
  'xp',
  'btg',
  'rico',
  'nuinvest',
  'clear',
  'inter dtvm',
  'agora',
  'ágora',
  'genial',
  'avenue',
  'ion',
  'íon',
];

function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * R40: Lista despesas antigas cuja descrição (ou conta destino) parecem um aporte
 * para uma corretora vinculada, para que o usuário escolha manualmente quais reclassificar.
 */
export function findExpenseAporteCandidates(
  entries: FinEntry[],
  brokerAccounts: FinAccount[]
): AporteExpenseCandidate[] {
  const brokerNames = brokerAccounts
    .map((a) => normalizeText(a.name))
    .filter((n) => n.length >= 2);
  const brokerIds = new Set(brokerAccounts.map((a) => a.id));

  const candidates: AporteExpenseCandidate[] = [];
  for (const entry of entries) {
    if (entry.of_removed_at) continue;
    if (entry.kind !== 'expense') continue;
    if (entry.transfer_group_id || entry.linked_transaction_id) continue;

    if (brokerIds.has(entry.account_id)) {
      candidates.push({ entry, matchedKeyword: 'conta corretora' });
      continue;
    }

    const desc = normalizeText(`${entry.description} ${entry.description_raw ?? ''}`);
    if (!desc) continue;

    const matchedBroker = brokerNames.find((bName) => desc.includes(bName));
    if (matchedBroker) {
      candidates.push({ entry, matchedKeyword: matchedBroker });
      continue;
    }

    const matchedKw = APORTE_KEYWORDS.find((kw) => desc.includes(normalizeText(kw)));
    if (matchedKw) {
      candidates.push({ entry, matchedKeyword: matchedKw });
    }
  }

  return candidates.sort((a, b) => b.entry.due_date.localeCompare(a.entry.due_date));
}
