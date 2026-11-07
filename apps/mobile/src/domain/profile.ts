/**
 * S42: Funções puras de perfil do usuário.
 */

/**
 * Deriva as iniciais a partir do nome do usuário:
 * - 1ª letra das 2 primeiras palavras, maiúsculas (ex: "Pedro Lima" -> "PL").
 * - Uma única palavra -> 1 letra (ex: "pedro" -> "P").
 * - Vazio ou espaços -> ""
 */
export function deriveInitials(name: string): string {
  if (!name) return '';
  const clean = name.trim();
  if (!clean) return '';

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}
