import { deriveInitials } from '../profile';

describe('S42: User Profile Domain', () => {
  describe('deriveInitials', () => {
    it('S42-T01: should derive initials according to specification rules', () => {
      // Duas palavras: primeira letra de cada
      expect(deriveInitials('Pedro Lima')).toBe('PL');
      // Uma palavra: primeira letra
      expect(deriveInitials('pedro')).toBe('P');
      // Espaços extras e mais de duas palavras: primeiras 2 palavras
      expect(deriveInitials('  ana   maria souza ')).toBe('AM');
      // Vazio ou apenas espaços: ""
      expect(deriveInitials('')).toBe('');
      expect(deriveInitials('   ')).toBe('');
      // Acentos
      expect(deriveInitials('Érica Alves')).toBe('ÉA');
      expect(deriveInitials('álvaro')).toBe('Á');
    });
  });
});
