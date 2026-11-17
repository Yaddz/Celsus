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

export function parseAccessKey(_input: string): ParsedAccessKey {
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
    error: 'Não implementado',
  };
}
