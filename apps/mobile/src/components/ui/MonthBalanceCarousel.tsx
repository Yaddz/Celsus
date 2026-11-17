import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityActionEvent,
  type PanResponderGestureState,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { addMonthsYearMonth, formatCentsBRL, formatYearMonthPtBr } from '../../domain/financeFlow';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatSignedCentsBRL, getFinUiColors } from '../../screens/finance/finTheme';
import { deckGesture } from '../../theme/motion';
import type { ThemeMode } from '../../theme/palettes';
import { bento, colors, space, typography } from '../../theme/tokens';
import { BentoTile } from './BentoGrid';

export interface MonthBalanceSummary {
  month: string;
  balanceCents: number;
  balanceDeltaCents: number;
  prevMonthName: string;
  endBalanceCents: number;
  minBalanceCents: number;
  minBalanceDate: string;
  endDateDDMM: string;
  isNegativeAlert: boolean;
}

export interface MonthBalanceCarouselProps {
  month: string;
  maxMonth?: string;
  currentMonth?: string;
  getMonthSummary: (yearMonth: string) => MonthBalanceSummary;
  onMonthChange: (nextMonth: string) => void;
  onCashflowPress?: () => void;
  isPrivacyMode?: boolean;
  themeMode?: ThemeMode;
  testID?: string;
}

interface MonthCardFaceProps {
  summary: MonthBalanceSummary;
  isActive: boolean;
  isPrivacyMode: boolean;
  themeMode: ThemeMode;
  onCashflowPress?: () => void;
}

const MonthCardFace: React.FC<MonthCardFaceProps> = ({
  summary,
  isActive,
  isPrivacyMode,
  themeMode,
  onCashflowPress,
}) => {
  const c = getFinUiColors(themeMode);
  const minDay = summary.minBalanceDate.slice(8, 10);
  const balanceText = formatCentsBRL(summary.balanceCents, isPrivacyMode);
  const comparisonText = isPrivacyMode
    ? `R$ •••••• em relação a ${summary.prevMonthName}`
    : `${formatSignedCentsBRL(
        summary.balanceDeltaCents,
        summary.balanceDeltaCents >= 0 ? 'income' : 'expense',
        false
      )} em relação a ${summary.prevMonthName}`;
  const forecastText = `Previsão para ${summary.endDateDDMM}: ${formatCentsBRL(
    summary.endBalanceCents,
    isPrivacyMode
  )} · menor saldo dia ${minDay}: ${formatCentsBRL(summary.minBalanceCents, isPrivacyMode)}`;

  return (
    <BentoTile variant="primary" title="SALDO DO MÊS">
      <Text
        testID={isActive ? 'finance-month-balance' : `finance-month-balance-${summary.month}`}
        style={[styles.heroValue, { color: c.primaryFg }]}
      >
        {balanceText}
      </Text>
      <Text
        testID={isActive ? 'finance-month-comparison' : `finance-month-comparison-${summary.month}`}
        style={[styles.heroSub, { color: c.primaryMuted }]}
      >
        {comparisonText}
      </Text>
      <TouchableOpacity
        testID={isActive ? 'finance-cashflow-forecast' : `finance-cashflow-forecast-${summary.month}`}
        activeOpacity={0.75}
        disabled={!isActive || !onCashflowPress}
        onPress={isActive ? onCashflowPress : undefined}
        style={styles.forecastTouchable}
      >
        <Text style={[styles.heroSub, { color: c.primaryFg, opacity: 0.92 }]}>{forecastText}</Text>
        {summary.isNegativeAlert ? (
          <Text
            testID={
              isActive
                ? 'finance-cashflow-negative-warning'
                : `finance-cashflow-negative-warning-${summary.month}`
            }
            style={[styles.heroSub, styles.negativeWarning]}
          >
            Aviso: menor saldo previsto negativo
          </Text>
        ) : null}
      </TouchableOpacity>
    </BentoTile>
  );
};

export const MonthBalanceCarousel: React.FC<MonthBalanceCarouselProps> = ({
  month,
  maxMonth,
  currentMonth,
  getMonthSummary,
  onMonthChange,
  onCashflowPress,
  isPrivacyMode = false,
  themeMode = 'dark',
  testID = 'finance-month-balance-carousel',
}) => {
  const c = getFinUiColors(themeMode);
  const isLight = themeMode === 'light';
  const reducedMotion = useReducedMotion();
  const [cardWidth, setCardWidth] = useState(0);
  const panX = useRef(new Animated.Value(0)).current;

  const prevMonth = useMemo(() => addMonthsYearMonth(month, -1), [month]);
  const nextMonth = useMemo(() => addMonthsYearMonth(month, 1), [month]);
  const isAtMaxMonth = Boolean(maxMonth && month >= maxMonth);
  const showTodayButton = Boolean(currentMonth && month !== currentMonth);

  const prevSummary = useMemo(() => getMonthSummary(prevMonth), [getMonthSummary, prevMonth]);
  const currentSummary = useMemo(() => getMonthSummary(month), [getMonthSummary, month]);
  const nextSummary = useMemo(() => getMonthSummary(nextMonth), [getMonthSummary, nextMonth]);

  const latestRef = useRef({
    month,
    prevMonth,
    nextMonth,
    isAtMaxMonth,
    maxMonth,
    cardWidth,
    reducedMotion,
    onMonthChange,
  });
  latestRef.current = {
    month,
    prevMonth,
    nextMonth,
    isAtMaxMonth,
    maxMonth,
    cardWidth,
    reducedMotion,
    onMonthChange,
  };

  const animateReset = (tension: number, startOffset = 0) => {
    if (latestRef.current.reducedMotion) {
      panX.setValue(0);
      return;
    }
    if (startOffset !== 0) {
      panX.setValue(startOffset);
    }
    Animated.spring(panX, {
      toValue: 0,
      useNativeDriver: true,
      friction: deckGesture.friction,
      tension,
    }).start();
  };

  const commitMonth = (targetMonth: string, direction: -1 | 0 | 1) => {
    const latest = latestRef.current;
    if (latest.maxMonth && targetMonth > latest.maxMonth) {
      animateReset(deckGesture.tensionReturn);
      return;
    }
    latest.onMonthChange(targetMonth);
    const width = latest.cardWidth > 0 ? Math.min(latest.cardWidth * 0.25, 48) : 32;
    const startOffset = direction === 1 ? width : direction === -1 ? -width : 0;
    animateReset(deckGesture.tensionAdvance, startOffset);
  };

  const handleRelease = (e: any, gestureState?: PanResponderGestureState) => {
    const latest = latestRef.current;
    const dx =
      gestureState?.dx !== 0 && gestureState?.dx !== undefined
        ? gestureState.dx
        : (e?.gestureState?.dx ?? e?.nativeEvent?.translationX ?? 0);
    const effectiveThreshold =
      latest.cardWidth > 0
        ? latest.cardWidth * deckGesture.distanceRatio
        : deckGesture.fallbackDistancePx;

    if (dx <= -effectiveThreshold) {
      if (latest.isAtMaxMonth) {
        animateReset(deckGesture.tensionReturn);
        return;
      }
      commitMonth(latest.nextMonth, 1);
    } else if (dx >= effectiveThreshold) {
      commitMonth(latest.prevMonth, -1);
    } else {
      animateReset(deckGesture.tensionReturn);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > deckGesture.moveThresholdPx &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: (_, gesture) =>
        Math.abs(gesture.dy) >= Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0 && latestRef.current.isAtMaxMonth) {
          panX.setValue(gesture.dx * deckGesture.edgeResistance);
          return;
        }
        panX.setValue(gesture.dx);
      },
      onPanResponderRelease: (e, gesture) => handleRelease(e, gesture),
      onPanResponderTerminate: (e, gesture) => handleRelease(e, gesture),
    })
  ).current;

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      if (!isAtMaxMonth) {
        commitMonth(nextMonth, 1);
      }
    } else if (event.nativeEvent.actionName === 'decrement') {
      commitMonth(prevMonth, -1);
    }
  };

  const neighborWidth = cardWidth > 0 ? cardWidth : 320;
  const pills = [prevMonth, month, nextMonth];

  return (
    <View
      testID={testID}
      accessibilityLabel={`Saldo do mês de ${formatYearMonthPtBr(month)}`}
      accessibilityActions={[
        { name: 'increment', label: 'Próximo mês' },
        { name: 'decrement', label: 'Mês anterior' },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
      style={styles.container}
    >
      <View
        testID="finance-month-carousel-track"
        onLayout={(e) => {
          const w = e?.nativeEvent?.layout?.width;
          if (w && w > 0 && w !== cardWidth) {
            setCardWidth(w);
          }
        }}
        style={styles.trackViewport}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ transform: [{ translateX: panX }] }}>
          <View
            pointerEvents="none"
            style={[styles.neighborCard, { left: -neighborWidth, width: neighborWidth }]}
          >
            <MonthCardFace
              summary={prevSummary}
              isActive={false}
              isPrivacyMode={isPrivacyMode}
              themeMode={themeMode}
            />
          </View>

          <View style={styles.activeCard}>
            <MonthCardFace
              summary={currentSummary}
              isActive
              isPrivacyMode={isPrivacyMode}
              themeMode={themeMode}
              onCashflowPress={onCashflowPress}
            />
          </View>

          {!isAtMaxMonth ? (
            <View
              pointerEvents="none"
              style={[styles.neighborCard, { left: neighborWidth, width: neighborWidth }]}
            >
              <MonthCardFace
                summary={nextSummary}
                isActive={false}
                isPrivacyMode={isPrivacyMode}
                themeMode={themeMode}
              />
            </View>
          ) : null}
        </Animated.View>
      </View>

      {/* Indicador acessível em pílulas com setas discretas nas pontas */}
      <View
        testID="finance-home-month-rail"
        style={[styles.monthRail, { backgroundColor: c.surfaceContainer }]}
      >
        <TouchableOpacity
          testID="finance-home-month-prev"
          accessibilityRole="button"
          accessibilityLabel="Mês anterior"
          onPress={() => commitMonth(prevMonth, -1)}
          style={styles.monthArrowBtn}
        >
          <MaterialIcons name="chevron-left" size={20} color={c.muted} />
        </TouchableOpacity>

        <View style={styles.railCenter}>
          <Text testID="finance-home-month-label" style={[styles.monthLabel, { color: c.text }]}>
            {formatYearMonthPtBr(month)}
          </Text>
          <View
            testID="finance-month-pills"
            accessibilityRole="tablist"
            accessibilityLabel="Indicador de meses"
            style={styles.pillsRow}
          >
            {pills.map((m) => {
              const isSelected = m === month;
              const isDisabled = Boolean(maxMonth && m > maxMonth);
              return (
                <TouchableOpacity
                  key={m}
                  testID={`finance-month-pill-${m}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected, disabled: isDisabled }}
                  accessibilityLabel={formatYearMonthPtBr(m)}
                  disabled={isDisabled}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  onPress={() => {
                    if (m === month || isDisabled) return;
                    commitMonth(m, m > month ? 1 : -1);
                  }}
                  style={[
                    styles.pillDot,
                    isLight && styles.pillDotLight,
                    isSelected && [styles.pillDotActive, { backgroundColor: colors.primary }],
                    isDisabled && styles.pillDotDisabled,
                  ]}
                />
              );
            })}
          </View>
        </View>

        <View style={styles.railRight}>
          {showTodayButton && currentMonth ? (
            <TouchableOpacity
              testID="finance-month-today-btn"
              accessibilityRole="button"
              accessibilityLabel="Voltar para o mês atual"
              onPress={() => commitMonth(currentMonth, currentMonth > month ? 1 : -1)}
              style={[styles.todayBtn, { borderColor: c.border, backgroundColor: c.surface }]}
            >
              <Text style={[styles.todayBtnText, { color: colors.primary }]}>Hoje</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            testID="finance-home-month-next"
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            accessibilityState={{ disabled: isAtMaxMonth }}
            disabled={isAtMaxMonth}
            onPress={() => commitMonth(nextMonth, 1)}
            style={[styles.monthArrowBtn, isAtMaxMonth && styles.arrowDisabled]}
          >
            <MaterialIcons name="chevron-right" size={20} color={c.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  trackViewport: {
    overflow: 'hidden',
    borderRadius: bento.tileRadius,
  },
  activeCard: {
    width: '100%',
  },
  neighborCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  heroValue: {
    fontFamily: typography.fontFamily,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 38,
  },
  heroSub: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  forecastTouchable: {
    marginTop: 8,
  },
  negativeWarning: {
    color: '#FFE0B2',
    fontWeight: '700',
    marginTop: 2,
  },
  monthRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  monthArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  railCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  monthLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
  },
  pillDotLight: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  pillDotActive: {
    width: 18,
    borderRadius: 3,
  },
  pillDotDisabled: {
    opacity: 0.25,
  },
  railRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todayBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
  },
  todayBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    fontWeight: '600',
  },
});
