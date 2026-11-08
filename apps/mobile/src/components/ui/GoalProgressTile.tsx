import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { BentoTile } from './BentoGrid';
import { SkeletonSwap, SkeletonTile } from './Skeleton';
import { AnimatedModalSheet } from './AnimatedModalSheet';
import { LedgerInput } from './LedgerInput';
import { bento, colors, typography } from '../../theme/tokens';
import { calculateGoalProgress, projectMonthsToGoal } from '../../domain/finance/goal';

const brl = (v: string | number) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MASK = 'R$ ••••••';

export const formatMonthsPtBr = (months: number): string => {
  if (months <= 0) return 'meta atingida';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ${y === 1 ? 'ano' : 'anos'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'mês' : 'meses'}`);
  return `≈ ${parts.join(' e ')}`;
};

/** Altura fixa do tile: o esqueleto e o conteúdo final ocupam exatamente o mesmo espaço. */
export const GOAL_TILE_HEIGHT = 114;

export interface GoalProgressTileProps {
  /** Mostra o esqueleto (mesmas dimensões) enquanto a carteira carrega. */
  loading?: boolean;
  /** Valor atual da carteira (número em string, sem formatação). */
  currentValue: string | number;
  patrimonyGoal?: string | null;
  monthlyContribution?: string | null;
  isPrivacyMode?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Tile Bento "Meta de patrimônio": progresso, quanto falta e previsão. */
const GoalProgressTileContent: React.FC<GoalProgressTileProps> = ({
  currentValue,
  patrimonyGoal,
  monthlyContribution,
  isPrivacyMode = false,
  onPress,
  testID = 'home-goal-tile',
}) => {
  const hasGoal = !!patrimonyGoal && Number(patrimonyGoal) > 0;
  const v = bento.variants.forest;

  if (!hasGoal) {
    return (
      <BentoTile variant="dark" title="Meta de patrimônio" onPress={onPress} testID={testID} height={GOAL_TILE_HEIGHT}>
        <Text style={{ fontFamily: typography.fontFamily, fontSize: 13, color: colors.parchmentPale }}>
          Defina sua meta e acompanhe o progresso.
        </Text>
        <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, color: colors.primary, marginTop: 8 }}>
          Definir meta →
        </Text>
      </BentoTile>
    );
  }

  const progress = calculateGoalProgress(currentValue, patrimonyGoal);
  const months = projectMonthsToGoal(currentValue, patrimonyGoal!, monthlyContribution || 0);
  const pct = Number(progress.progressPercent);
  const show = (x: string | number) => (isPrivacyMode ? MASK : brl(x));

  return (
    <BentoTile variant="forest" title="Meta de patrimônio" onPress={onPress} testID={testID} height={GOAL_TILE_HEIGHT}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Text
          testID={`${testID}-percent`}
          style={{ fontFamily: typography.fontFamily, fontSize: 36, fontWeight: '700', color: v.foreground }}
        >
          {pct.toFixed(0)}%
        </Text>
        <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, color: v.muted, marginBottom: 6 }}>
          de {show(patrimonyGoal!)}
        </Text>
      </View>
      <View
        testID={`${testID}-bar`}
        style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.3)', marginTop: 10, overflow: 'hidden' }}
      >
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: colors.primary }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, color: v.foreground }}>
          {progress.reached ? 'Meta atingida 🎉' : `faltam ${show(progress.remaining)}`}
        </Text>
        {!progress.reached && months !== null && Number(monthlyContribution || 0) > 0 ? (
          <Text testID={`${testID}-eta`} style={{ fontFamily: typography.fontFamily, fontSize: 12, color: v.muted }}>
            {formatMonthsPtBr(months)}
          </Text>
        ) : null}
      </View>
    </BentoTile>
  );
};

/** Tile Bento "Meta de patrimônio": esqueleto com fade enquanto carrega, conteúdo depois. */
const GoalProgressTileBase: React.FC<GoalProgressTileProps> = ({ loading = false, ...rest }) => (
  <SkeletonSwap loading={loading} skeleton={<SkeletonTile height={GOAL_TILE_HEIGHT} testID={`${rest.testID ?? 'home-goal-tile'}-skeleton`} />}>
    <GoalProgressTileContent {...rest} />
  </SkeletonSwap>
);

export interface GoalEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  initialGoal?: string | null;
  initialMonthly?: string | null;
  onSave: (goal: string | null, monthly: string | null) => void;
  themeMode?: 'dark' | 'light';
}

/** "1.234,56" / "1234.56" → "1234.56"; vazio → null. */
export const parseMoneyInput = (text: string): string | null => {
  const t = text.trim();
  if (!t) return null;
  const isGrouped = /^\d{1,3}(\.\d{3})+$/.test(t); // "100.000" = cem mil (pt-BR)
  const normalized = t.includes(',') || isGrouped ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? String(n) : null;
};

export const GoalEditorSheet: React.FC<GoalEditorSheetProps> = ({
  visible,
  onClose,
  initialGoal,
  initialMonthly,
  onSave,
  themeMode = 'dark',
}) => {
  const [goal, setGoal] = useState('');
  const [monthly, setMonthly] = useState('');
  useEffect(() => {
    if (visible) {
      setGoal(initialGoal ? String(initialGoal).replace('.', ',') : '');
      setMonthly(initialMonthly ? String(initialMonthly).replace('.', ',') : '');
    }
  }, [visible, initialGoal, initialMonthly]);

  return (
    <AnimatedModalSheet visible={visible} onClose={onClose} themeMode={themeMode} testID="goal-editor-sheet">
      <Text style={{ fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '700', color: colors.parchmentPale, marginBottom: 16 }}>
        Meta de patrimônio
      </Text>
      <LedgerInput
        label="Valor da meta"
        prefix="R$"
        value={goal}
        onChangeText={setGoal}
        placeholder="100.000,00"
        testID="goal-input"
        themeMode={themeMode}
      />
      <LedgerInput
        label="Aporte mensal planejado"
        prefix="R$"
        value={monthly}
        onChangeText={setMonthly}
        placeholder="0,00"
        testID="goal-monthly-input"
        themeMode={themeMode}
        style={{ marginTop: 12 }}
      />
      <TouchableOpacity
        testID="goal-save-btn"
        accessibilityRole="button"
        onPress={() => onSave(parseMoneyInput(goal), parseMoneyInput(monthly))}
        style={{ backgroundColor: colors.primary, borderRadius: bento.tileRadius, paddingVertical: 16, alignItems: 'center', marginTop: 20 }}
      >
        <Text style={{ fontFamily: typography.fontFamily, fontWeight: '700', color: '#1A0E08' }}>Salvar meta</Text>
      </TouchableOpacity>
    </AnimatedModalSheet>
  );
};

/** Memoizado: só re-renderiza quando as props mudam (troca de carteira não refaz o resto da Home). */
export const GoalProgressTile = React.memo(GoalProgressTileBase);
