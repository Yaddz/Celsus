import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GoalProgressTile, GoalEditorSheet, parseMoneyInput, formatMonthsPtBr } from '../GoalProgressTile';

describe('GoalProgressTile', () => {
  it('mostra CTA quando não há meta', () => {
    const onPress = jest.fn();
    render(<GoalProgressTile currentValue="1000" onPress={onPress} />);
    fireEvent.press(screen.getByTestId('home-goal-tile'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText(/Definir meta/)).toBeTruthy();
  });
  it('mostra % e previsão com meta de 100k', () => {
    render(<GoalProgressTile currentValue="48320.75" patrimonyGoal="100000" monthlyContribution="2000" />);
    expect(screen.getByTestId('home-goal-tile-percent').props.children.join('')).toBe('48%');
    expect(screen.getByTestId('home-goal-tile-eta')).toBeTruthy();
  });
  it('oculta valores em modo privacidade', () => {
    render(<GoalProgressTile currentValue="48320.75" patrimonyGoal="100000" isPrivacyMode />);
    expect(screen.queryByText(/100\.000/)).toBeNull();
  });
  it('parse e formatação', () => {
    expect(parseMoneyInput('100.000,50')).toBe('100000.5');
    expect(parseMoneyInput('')).toBeNull();
    expect(formatMonthsPtBr(14)).toBe('≈ 1 ano e 2 meses');
  });
  it('editor salva meta', () => {
    const onSave = jest.fn();
    render(<GoalEditorSheet visible onClose={() => {}} onSave={onSave} />);
    fireEvent.changeText(screen.getByTestId('goal-input'), '100.000');
    fireEvent.press(screen.getByTestId('goal-save-btn'));
    expect(onSave).toHaveBeenCalledWith('100000', null);
  });
});
