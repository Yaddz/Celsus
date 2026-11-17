import { extractTextFromImage } from 'expo-text-extractor';
import {
  extractAccessKeyFromLines,
  parseAccessKey,
  parseNfceQr,
  parseReceiptText,
  suggestCategoryFromRules,
  type CategoryRuleCandidate,
  type ReceiptDraft,
  type ReceiptDraftField,
} from '../domain/receipt';
import { finRepository } from '../repositories/finRepository';
import { nfceLookupService } from './nfceLookupService';

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

function docLabelForModel(model: string | null, uf: string | null): string {
  const base = model === '55' ? 'NF-e' : model === '59' ? 'CF-e SAT' : 'NFC-e';
  return uf ? `${base} ${uf}` : base;
}

export const receiptService = {
  async processReceiptImage(uri: string): Promise<ReceiptDraft> {
    const lines = await extractTextFromImage(uri);
    const parsed = parseReceiptText(lines);
    const keyFromLines = extractAccessKeyFromLines(lines);
    const externalId = keyFromLines?.valid ? keyFromLines.accessKey : null;
    const cnpj = parsed.cnpj.value ?? keyFromLines?.cnpj ?? null;

    const existing = externalId
      ? await finRepository.findEntryByExternalId(externalId)
      : null;

    const rules = await finRepository.listCategoryRules('expense');
    const categoryId = suggestCategoryFromRules(toRuleCandidates(rules), {
      merchantName: parsed.merchantName.value,
      cnpj,
    });

    const lowConfidenceFields: ReceiptDraftField[] = [];
    if (parsed.totalCents.confidence !== 'alta') lowConfidenceFields.push('amount');
    if (parsed.merchantName.confidence === 'baixa') lowConfidenceFields.push('description');
    if (parsed.dateIso.confidence === 'baixa') lowConfidenceFields.push('date');

    return {
      description: parsed.merchantName.value ?? '',
      amountCents: parsed.totalCents.value,
      dateIso: parsed.dateIso.value,
      categoryId,
      externalId,
      source: 'OCR',
      lowConfidenceFields,
      cnpj,
      paymentMethod: parsed.paymentMethod.value,
      duplicateEntryId: existing?.id ?? null,
      rawLines: lines,
    };
  },

  async processNfceQr(url: string): Promise<ReceiptDraft> {
    const qr = parseNfceQr(url);
    if (!qr.valid || !qr.accessKey) {
      throw new Error(qr.error ?? 'QR code inválido para documento fiscal.');
    }

    let amountCents = qr.amountCents;
    if (amountCents === null && /^https?:\/\//i.test(url)) {
      const sefazEnabled = await nfceLookupService.isEnabled();
      if (sefazEnabled) {
        const lookup = await nfceLookupService.fetchNfceTotal(url);
        if (lookup.amountCents !== null) {
          amountCents = lookup.amountCents;
        }
      }
    }

    const existing = await finRepository.findEntryByExternalId(qr.accessKey);
    const rules = await finRepository.listCategoryRules('expense');
    const categoryId = suggestCategoryFromRules(toRuleCandidates(rules), {
      cnpj: qr.cnpj,
    });

    const lowConfidenceFields: ReceiptDraftField[] = ['description'];
    if (amountCents === null) lowConfidenceFields.push('amount');

    return {
      description: docLabelForModel(qr.model, qr.uf),
      amountCents,
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
    const trimmed = (code ?? '').trim();
    if (/^https?:\/\//i.test(trimmed) || trimmed.includes('?') || trimmed.includes('|')) {
      return this.processNfceQr(trimmed);
    }

    const parsed = parseAccessKey(trimmed);
    if (!parsed.valid || !parsed.accessKey) {
      throw new Error(parsed.error ?? 'Chave de acesso inválida.');
    }

    const existing = await finRepository.findEntryByExternalId(parsed.accessKey);
    const rules = await finRepository.listCategoryRules('expense');
    const categoryId = suggestCategoryFromRules(toRuleCandidates(rules), {
      cnpj: parsed.cnpj,
    });

    return {
      description: docLabelForModel(parsed.model, parsed.uf),
      amountCents: null,
      dateIso: null,
      categoryId,
      externalId: parsed.accessKey,
      source: 'OCR',
      lowConfidenceFields: ['description', 'amount'],
      cnpj: parsed.cnpj,
      paymentMethod: null,
      duplicateEntryId: existing?.id ?? null,
    };
  },
};
