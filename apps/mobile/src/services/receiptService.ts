import { extractTextFromImage } from 'expo-text-extractor';
import {
  parseNfceQr,
  parseReceiptText,
  suggestCategoryFromRules,
  type CategoryRuleCandidate,
  type ReceiptDraft,
  type ReceiptDraftField,
} from '../domain/receipt';
import { finRepository } from '../repositories/finRepository';

function toRuleCandidates(
  rules: Awaited<ReturnType<typeof finRepository.listCategoryRules>>
): CategoryRuleCandidate[] {
  return rules.map((r) => ({
    id: r.id,
    match_type: r.match_type as CategoryRuleCandidate['match_type'],
    pattern: r.pattern,
    kind: r.kind,
    category_id: r.category_id,
  }));
}

export const receiptService = {
  async processReceiptImage(uri: string): Promise<ReceiptDraft> {
    const lines = await extractTextFromImage(uri);
    const parsed = parseReceiptText(lines);
    const rules = await finRepository.listCategoryRules('expense');
    const categoryId = suggestCategoryFromRules(toRuleCandidates(rules), {
      merchantName: parsed.merchantName.value,
      cnpj: parsed.cnpj.value,
    });

    const lowConfidenceFields: ReceiptDraftField[] = [];
    if (parsed.totalCents.confidence === 'baixa') lowConfidenceFields.push('amount');
    if (parsed.merchantName.confidence === 'baixa') lowConfidenceFields.push('description');
    if (parsed.dateIso.confidence === 'baixa') lowConfidenceFields.push('date');

    return {
      description: parsed.merchantName.value ?? '',
      amountCents: parsed.totalCents.value,
      dateIso: parsed.dateIso.value,
      categoryId,
      externalId: null,
      source: 'OCR',
      lowConfidenceFields,
      cnpj: parsed.cnpj.value,
      paymentMethod: parsed.paymentMethod.value,
      duplicateEntryId: null,
    };
  },

  async processNfceQr(url: string): Promise<ReceiptDraft> {
    const qr = parseNfceQr(url);
    if (!qr.valid || !qr.accessKey) {
      throw new Error(qr.error ?? 'QR code inválido para NFC-e.');
    }

    const existing = await finRepository.findEntryByExternalId(qr.accessKey);
    const rules = await finRepository.listCategoryRules('expense');
    const categoryId = suggestCategoryFromRules(toRuleCandidates(rules), {
      cnpj: qr.cnpj,
    });

    const lowConfidenceFields: ReceiptDraftField[] = ['description'];
    if (qr.amountCents === null) lowConfidenceFields.push('amount');

    return {
      description: qr.uf ? `NFC-e ${qr.uf}` : 'NFC-e',
      amountCents: qr.amountCents,
      dateIso: null,
      categoryId,
      externalId: qr.accessKey,
      source: 'OCR',
      lowConfidenceFields,
      cnpj: qr.cnpj,
      paymentMethod: null,
      duplicateEntryId: existing?.id ?? null,
    };
  },

  async processAccessCode(code: string): Promise<ReceiptDraft> {
    return this.processNfceQr(code);
  },
};
