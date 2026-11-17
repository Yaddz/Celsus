import { layout } from './tokens';

/**
 * Padding inferior do conteúdo rolável das telas que ficam atrás da nav bar flutuante.
 * Cálculo único dos dois módulos: safe area (com piso de layout.safeBottomMin) + respiro da nav bar
 * (+ respiro do botão flutuante, quando a tela tem um).
 */
export function dockContentPaddingBottom(insetBottom: number = 0, options: { withFab?: boolean } = {}): number {
  const safeBottom = Math.max(insetBottom, layout.safeBottomMin);
  return safeBottom + layout.dockClearance + (options.withFab ? layout.fabClearance : 0);
}
