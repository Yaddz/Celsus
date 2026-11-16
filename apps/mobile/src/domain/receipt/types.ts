export type FieldConfidence = 'alta' | 'baixa' | 'ausente';

export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
}

export type ReceiptPaymentMethod =
  | 'PIX'
  | 'CREDITO'
  | 'DEBITO'
  | 'DINHEIRO'
  | 'VALE'
  | 'OUTRO';

export interface ParsedReceipt {
  totalCents: ParsedField<number>;
  dateIso: ParsedField<string>;
  time: ParsedField<string>;
  cnpj: ParsedField<string>;
  merchantName: ParsedField<string>;
  paymentMethod: ParsedField<ReceiptPaymentMethod>;
}

export interface ParsedNfceQr {
  valid: boolean;
  accessKey: string | null;
  ufCode: string | null;
  uf: string | null;
  aamm: string | null;
  cnpj: string | null;
  model: string | null;
  amountCents: number | null;
  error?: string;
}

export interface CategoryRuleCandidate {
  id: string;
  match_type: 'contains' | 'starts_with' | 'exact';
  pattern: string;
  kind?: string;
  category_id: string;
}

export type ReceiptDraftField = 'description' | 'amount' | 'date';

export interface ReceiptDraft {
  description: string;
  amountCents: number | null;
  dateIso: string | null;
  categoryId: string | null;
  externalId: string | null;
  source: 'OCR';
  lowConfidenceFields: ReceiptDraftField[];
  cnpj?: string | null;
  paymentMethod?: ReceiptPaymentMethod | null;
  duplicateEntryId?: string | null;
}
