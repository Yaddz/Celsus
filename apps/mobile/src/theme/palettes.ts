export type PortfolioPaletteId = 'classic' | 'harbor' | 'docks' | 'tribunal';

export interface PortfolioPalette {
  id: PortfolioPaletteId;
  name: string;
  inspiration: string;
  cardBg: string;
  orbSecondary: string;
  accent: string;
  onCard: string;
}

export type ThemeMode = 'dark' | 'light';

export interface ThemeModeColors {
  background: string;
  surface: string;
  surfaceContainer: string;
  onSurface: string;
  muted: string;
}

export interface AssetClassColors {
  FIXED_INCOME: string;
  FII: string;
  STOCK: string;
  CRYPTO: string;
}

export const PORTFOLIO_PALETTE_ORDER: PortfolioPaletteId[] = [
  // Stub: to be populated in Phase B
];

export const PORTFOLIO_PALETTES: Record<PortfolioPaletteId, PortfolioPalette> = {
  // Stub: to be populated in Phase B
} as any;

export const ASSET_CLASS_COLORS: AssetClassColors = {
  // Stub: to be populated in Phase B
} as any;

export const THEME_COLORS: Record<ThemeMode, ThemeModeColors> = {
  // Stub: to be populated in Phase B
} as any;

export function getPortfolioPalette(index: number): PortfolioPalette {
  throw new Error('Not implemented: Phase B');
}

export function getPortfolioPaletteById(id: PortfolioPaletteId): PortfolioPalette {
  throw new Error('Not implemented: Phase B');
}

export function getThemeColors(mode: ThemeMode): ThemeModeColors {
  throw new Error('Not implemented: Phase B');
}

export class ThemeModeService {
  private currentMode: ThemeMode = 'dark';

  getThemeMode(): ThemeMode {
    throw new Error('Not implemented: Phase B');
  }

  setThemeMode(mode: ThemeMode): ThemeMode {
    throw new Error('Not implemented: Phase B');
  }

  toggleThemeMode(): ThemeMode {
    throw new Error('Not implemented: Phase B');
  }

  reset(): void {
    this.currentMode = 'dark';
  }
}

export const themeModeService = new ThemeModeService();
