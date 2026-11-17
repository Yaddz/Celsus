const UF_BY_CODE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

const SUPPORTED_MODELS = new Set(['65', '55', '59']);

export function isValidAccessKeyMod11(key44: string): boolean {
  if (!/^\d{44}$/.test(key44)) return false;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key44[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  const expectedDv = rem < 2 ? 0 : 11 - rem;
  return expectedDv === Number(key44[43]);
}

export interface ParsedAccessKey {
  valid: boolean;
  accessKey: string | null;
  ufCode: string | null;
  uf: string | null;
  aamm: string | null;
  cnpj: string | null;
  model: string | null;
  series: string | null;
  number: string | null;
  error?: string;
}

function invalidAccessKey(
  error: string,
  partial?: Partial<ParsedAccessKey>
): ParsedAccessKey {
  return {
    valid: false,
    accessKey: null,
    ufCode: null,
    uf: null,
    aamm: null,
    cnpj: null,
    model: null,
    series: null,
    number: null,
    error,
    ...partial,
  };
}

export function parseAccessKey(input: string): ParsedAccessKey {
  const cleaned = (input ?? '').replace(/[\s.\-/]+/g, '');
  if (!cleaned) {
    return invalidAccessKey('Informe a chave de acesso de 44 dígitos.');
  }

  let candidate: string | null = null;
  if (/^\d+$/.test(cleaned)) {
    if (cleaned.length !== 44) {
      return invalidAccessKey(`Chave de acesso deve ter 44 dígitos (recebido ${cleaned.length}).`);
    }
    candidate = cleaned;
  } else {
    const m = /(\d{44})/.exec(cleaned);
    if (!m) {
      return invalidAccessKey('Chave de acesso deve ter 44 dígitos.');
    }
    candidate = m[1];
  }

  if (!isValidAccessKeyMod11(candidate)) {
    return invalidAccessKey('Dígito verificador da chave inválido.');
  }

  const ufCode = candidate.slice(0, 2);
  const uf = UF_BY_CODE[ufCode] ?? null;
  const aamm = candidate.slice(2, 6);
  const cnpj = candidate.slice(6, 20);
  const model = candidate.slice(20, 22);
  const series = candidate.slice(22, 25);
  const number = candidate.slice(25, 34);

  if (!SUPPORTED_MODELS.has(model)) {
    return invalidAccessKey(`Modelo ${model} não suportado (aceitos: 55, 59 e 65).`, {
      ufCode,
      uf,
      aamm,
      cnpj,
      model,
      series,
      number,
    });
  }

  return {
    valid: true,
    accessKey: candidate,
    ufCode,
    uf,
    aamm,
    cnpj,
    model,
    series,
    number,
  };
}

/** Procura uma chave de 44 dígitos válida (modelos 55, 59 ou 65) em linhas de OCR, mesmo quebrada em até 3 linhas. */
export function extractAccessKeyFromLines(lines: string[]): ParsedAccessKey | null {
  for (let start = 0; start < lines.length; start++) {
    for (let span = 1; span <= 3 && start + span <= lines.length; span++) {
      const joined = lines.slice(start, start + span).join(' ');
      const digitsOnly = joined.replace(/\D/g, '');
      if (digitsOnly.length < 44) continue;
      for (let i = 0; i <= digitsOnly.length - 44; i++) {
        const slice = digitsOnly.slice(i, i + 44);
        const parsed = parseAccessKey(slice);
        if (parsed.valid) return parsed;
      }
    }
  }
  return null;
}
