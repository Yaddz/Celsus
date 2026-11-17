import type MaterialIcons from '@expo/vector-icons/MaterialIcons';

export type AppModule = 'investments' | 'finance';

export interface ModuleMeta {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

export const MODULE_META: Record<AppModule, ModuleMeta> = {
  investments: { label: 'Investimentos', icon: 'show-chart' },
  finance: { label: 'Finanças', icon: 'account-balance' },
};
