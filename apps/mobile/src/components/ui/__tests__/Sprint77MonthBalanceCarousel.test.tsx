import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  MonthBalanceCarousel,
  type MonthBalanceSummary,
} from '../MonthBalanceCarousel';

function makeSummary(month: string): MonthBalanceSummary {
  const map: Record<string, Partial<MonthBalanceSummary>> = {
    '2026-10': {
      balanceCents: 150000,
      balanceDeltaCents: 20000,
      prevMonthName: 'setembro',
      endBalanceCents: 160000,
      minBalanceCents: 50000,
      minBalanceDate: '2026-10-12',
      endDateDDMM: '31/10',
      isNegativeAlert: false,
    },
    '2026-11': {
      balanceCents: 380000,
      balanceDeltaCents: 230000,
      prevMonthName: 'outubro',
      endBalanceCents: 400000,
      minBalanceCents: 120000,
      minBalanceDate: '2026-11-15',
      endDateDDMM: '30/11',
      isNegativeAlert: false,
    },
    '2026-12': {
      balanceCents: -45000,
      balanceDeltaCents: -425000,
      prevMonthName: 'novembro',
      endBalanceCents: -20000,
      minBalanceCents: -80000,
      minBalanceDate: '2026-12-20',
      endDateDDMM: '31/12',
      isNegativeAlert: true,
    },
  };
  const base = map[month] ?? {
    balanceCents: 100000,
    balanceDeltaCents: 0,
    prevMonthName: 'anterior',
    endBalanceCents: 100000,
    minBalanceCents: 100000,
    minBalanceDate: `${month}-10`,
    endDateDDMM: `28/${month.slice(5, 7)}`,
    isNegativeAlert: false,
  };
  return {
    month,
    balanceCents: base.balanceCents ?? 0,
    balanceDeltaCents: base.balanceDeltaCents ?? 0,
    prevMonthName: base.prevMonthName ?? 'anterior',
    endBalanceCents: base.endBalanceCents ?? 0,
    minBalanceCents: base.minBalanceCents ?? 0,
    minBalanceDate: base.minBalanceDate ?? `${month}-10`,
    endDateDDMM: base.endDateDDMM ?? '30/11',
    isNegativeAlert: base.isNegativeAlert ?? false,
  };
}

describe('Sprint 77 — MonthBalanceCarousel', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('S77-T01: arrastar para esquerda vai ao próximo mês, para direita ao anterior, e arraste curto ou vertical não troca', async () => {
    const onMonthChange = jest.fn();

    await render(
      <MonthBalanceCarousel
        month="2026-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    const track = screen.getByTestId('finance-month-carousel-track');
    fireEvent(track, 'layout', {
      nativeEvent: { layout: { width: 320, height: 160, x: 0, y: 0 } },
    });

    // Arraste curto (< 50% de 320 = 160px) não troca
    fireEvent(track, 'responderRelease', { gestureState: { dx: -80, dy: 0 } });
    expect(onMonthChange).not.toHaveBeenCalled();

    // Arraste para esquerda (>= 50%) avança para 2026-12
    fireEvent(track, 'responderRelease', { gestureState: { dx: -180, dy: 0 } });
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    expect(onMonthChange).toHaveBeenCalledWith('2026-12');

    // Arraste para direita (>= 50%) volta para 2026-10
    fireEvent(track, 'responderRelease', { gestureState: { dx: 180, dy: 0 } });
    expect(onMonthChange).toHaveBeenCalledTimes(2);
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-10');

    // Movimento vertical dominante não deve ser capturado pelo carrossel
    const shouldCaptureVertical = track.props.onMoveShouldSetResponder?.(
      { nativeEvent: {} },
      { dx: 4, dy: 24, moveX: 0, moveY: 0, x0: 0, y0: 0, vx: 0, vy: 0, numberActiveTouches: 1, stateID: 1 }
    );
    expect(shouldCaptureVertical).toBe(false);
  });

  it('S77-T02: respeita o limite de 24 meses à frente e não avança além de maxMonth', async () => {
    const onMonthChange = jest.fn();

    await render(
      <MonthBalanceCarousel
        month="2028-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    const track = screen.getByTestId('finance-month-carousel-track');
    fireEvent(track, 'layout', {
      nativeEvent: { layout: { width: 320, height: 160, x: 0, y: 0 } },
    });

    fireEvent(track, 'responderRelease', { gestureState: { dx: -200, dy: 0 } });
    expect(onMonthChange).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('finance-home-month-next'));
    expect(onMonthChange).not.toHaveBeenCalled();

    // Voltar para o mês anterior continua permitido
    fireEvent.press(screen.getByTestId('finance-home-month-prev'));
    expect(onMonthChange).toHaveBeenCalledWith('2028-10');
  });

  it('S77-T03: pílulas, setas e ações de acessibilidade trocam de mês e mantêm estado sincronizado', async () => {
    const onMonthChange = jest.fn();

    await render(
      <MonthBalanceCarousel
        month="2026-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    expect(screen.getByTestId('finance-home-month-label')).toHaveTextContent('Novembro 2026');
    expect(screen.getByTestId('finance-month-pills')).toBeTruthy();
    expect(screen.getByTestId('finance-month-pill-2026-10')).toBeTruthy();
    expect(screen.getByTestId('finance-month-pill-2026-11').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(screen.getByTestId('finance-month-pill-2026-12')).toBeTruthy();

    fireEvent.press(screen.getByTestId('finance-month-pill-2026-12'));
    expect(onMonthChange).toHaveBeenCalledWith('2026-12');

    fireEvent.press(screen.getByTestId('finance-home-month-prev'));
    expect(onMonthChange).toHaveBeenCalledWith('2026-10');

    // Ações de acessibilidade para leitor de tela
    const a11yHost = screen.getByTestId('finance-month-balance-carousel');
    fireEvent(a11yHost, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-12');

    fireEvent(a11yHost, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onMonthChange).toHaveBeenLastCalledWith('2026-10');
  });

  it('S77-T04: atalho Hoje aparece fora do mês corrente e some quando já está nele', async () => {
    const onMonthChange = jest.fn();

    const { rerender } = await render(
      <MonthBalanceCarousel
        month="2026-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    expect(screen.queryByTestId('finance-month-today-btn')).toBeNull();

    await rerender(
      <MonthBalanceCarousel
        month="2026-12"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    const todayBtn = screen.getByTestId('finance-month-today-btn');
    expect(todayBtn).toBeTruthy();
    fireEvent.press(todayBtn);
    expect(onMonthChange).toHaveBeenCalledWith('2026-11');
  });

  it('S77-T05: com reduzir movimento ativo, troca de mês sem Animated.spring', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const springSpy = jest.spyOn(Animated, 'spring');
    const onMonthChange = jest.fn();

    await render(
      <MonthBalanceCarousel
        month="2026-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={onMonthChange}
      />
    );

    await waitFor(() => {
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
    });

    springSpy.mockClear();
    const track = screen.getByTestId('finance-month-carousel-track');
    fireEvent(track, 'layout', {
      nativeEvent: { layout: { width: 320, height: 160, x: 0, y: 0 } },
    });
    fireEvent(track, 'responderRelease', { gestureState: { dx: -180, dy: 0 } });

    expect(onMonthChange).toHaveBeenCalledWith('2026-12');
    expect(springSpy).not.toHaveBeenCalled();
  });

  it('S77-T06: modo privacidade mascara os valores nos três meses desenhados (anterior, atual e próximo)', async () => {
    await render(
      <MonthBalanceCarousel
        month="2026-11"
        currentMonth="2026-11"
        maxMonth="2028-11"
        getMonthSummary={makeSummary}
        onMonthChange={jest.fn()}
        isPrivacyMode
      />
    );

    expect(screen.getByTestId('finance-month-balance')).toHaveTextContent('R$ ••••••');
    expect(screen.getByTestId('finance-month-comparison')).toHaveTextContent('R$ ••••••');
    expect(screen.getByTestId('finance-month-balance-2026-10')).toHaveTextContent('R$ ••••••');
    expect(screen.getByTestId('finance-month-balance-2026-12')).toHaveTextContent('R$ ••••••');
  });
});
