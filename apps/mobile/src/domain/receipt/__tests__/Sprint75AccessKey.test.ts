import { parseAccessKey, parseNfceQr } from '../index';
import { ACCESS_KEY_S75_FIXTURES, NFCE_QR_FIXTURES } from './fixtures';

describe('Sprint 75 — Chave de acesso de 44 dígitos (Fase A)', () => {
  test('S75-T01: parseAccessKey aceita 44 dígitos com espaços, pontos ou quebras de linha e extrai UF, AAMM, CNPJ, modelo, série e número', () => {
    const spaced = '5326 1147 5084 1100 0156 6500 1000 1234 5618 7654 3216';
    const res = parseAccessKey(spaced);

    expect(res.valid).toBe(true);
    expect(res.accessKey).toBe(ACCESS_KEY_S75_FIXTURES.nfce65Df);
    expect(res.ufCode).toBe('53');
    expect(res.uf).toBe('DF');
    expect(res.aamm).toBe('2611');
    expect(res.cnpj).toBe('47508411000156');
    expect(res.model).toBe('65');
    expect(res.series).toBe('001');
    expect(res.number).toBe('000123456');

    const withDotsAndLines =
      '3526.1147.5084.1100\n0156.5900.0123.4567\n8912.3456.7899';
    const sat = parseAccessKey(withDotsAndLines);
    expect(sat.valid).toBe(true);
    expect(sat.model).toBe('59');
    expect(sat.uf).toBe('SP');
    expect(sat.accessKey).toBe(ACCESS_KEY_S75_FIXTURES.sat59);
  });

  test('S75-T02: parseAccessKey e parseNfceQr aceitam modelos 65, 55 e 59 e rejeitam outros modelos ou DV/tamanho inválido', () => {
    const nfe55 = parseAccessKey(ACCESS_KEY_S75_FIXTURES.nfe55);
    expect(nfe55.valid).toBe(true);
    expect(nfe55.model).toBe('55');

    const qr55 = parseNfceQr(NFCE_QR_FIXTURES.wrongModel55);
    expect(qr55.valid).toBe(true);
    expect(qr55.model).toBe('55');
    expect(qr55.accessKey).toBe(ACCESS_KEY_S75_FIXTURES.nfe55);

    const unsupported = parseAccessKey(ACCESS_KEY_S75_FIXTURES.unsupported57);
    expect(unsupported.valid).toBe(false);
    expect(unsupported.model).toBe('57');
    expect(unsupported.error).toMatch(/57|modelo|suportad/i);

    const badDv = parseAccessKey('53261147508411000156650010001234561876543210');
    expect(badDv.valid).toBe(false);
    expect(badDv.error).toMatch(/d[ií]gito/i);

    const short = parseAccessKey('1234567890');
    expect(short.valid).toBe(false);
    expect(short.error).toMatch(/44|tamanho/i);
  });
});
