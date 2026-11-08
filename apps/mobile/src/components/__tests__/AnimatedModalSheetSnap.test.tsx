import React from 'react';
import { Text, View } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AnimatedModalSheet } from '../ui/AnimatedModalSheet';

describe('Sprint 53 — Frente A: AnimatedModalSheet Snap & Dismissible', () => {
  it('S53-T01: without new snap props, keeps identical default behavior (renders children and closes on backdrop press)', () => {
    const onClose = jest.fn();
    render(
      <AnimatedModalSheet visible={true} onClose={onClose}>
        <Text>Conteúdo Padrão</Text>
      </AnimatedModalSheet>
    );

    expect(screen.getByText('Conteúdo Padrão')).toBeTruthy();

    const backdrop = screen.getByTestId('animated-sheet-backdrop');
    expect(backdrop).toBeTruthy();
    fireEvent.press(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('S53-T02: calculates collapsed height (~50%) when expanded=false and full height (~100%) when expanded=true', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <AnimatedModalSheet
        visible={true}
        onClose={onClose}
        expanded={false}
        collapsedHeight={0.5}
        expandedHeight={1.0}
      >
        <Text>Conteúdo Snap</Text>
      </AnimatedModalSheet>
    );

    const sheetContainer = screen.getByTestId('animated-sheet-container');
    expect(sheetContainer).toBeTruthy();

    // Com expanded={false}, a altura ou maxHeight deve refletir ~0.5 da tela
    const flatStyleCollapsed = Array.isArray(sheetContainer.props.style)
      ? Object.assign({}, ...sheetContainer.props.style.flat(Infinity).filter(Boolean))
      : sheetContainer.props.style;

    const collapsedValue = flatStyleCollapsed.height ?? flatStyleCollapsed.maxHeight;
    expect(collapsedValue).toBeDefined();

    // Rerender com expanded={true}
    rerender(
      <AnimatedModalSheet
        visible={true}
        onClose={onClose}
        expanded={true}
        collapsedHeight={0.5}
        expandedHeight={1.0}
      >
        <Text>Conteúdo Snap</Text>
      </AnimatedModalSheet>
    );

    const sheetContainerExpanded = screen.getByTestId('animated-sheet-container');
    const flatStyleExpanded = Array.isArray(sheetContainerExpanded.props.style)
      ? Object.assign({}, ...sheetContainerExpanded.props.style.flat(Infinity).filter(Boolean))
      : sheetContainerExpanded.props.style;

    const expandedValue = flatStyleExpanded.height ?? flatStyleExpanded.maxHeight;
    expect(expandedValue).toBeDefined();

    // A altura expandida deve ser significativamente maior que a colapsada (~100% vs ~50%)
    expect(expandedValue).toBeGreaterThan(collapsedValue);
  });

  it('S53-T03: when dismissible=false, backdrop press and onRequestClose do NOT invoke onClose', () => {
    const onClose = jest.fn();
    render(
      <AnimatedModalSheet
        visible={true}
        onClose={onClose}
        dismissible={false}
      >
        <Text>Bloqueado Durante Importação</Text>
      </AnimatedModalSheet>
    );

    const backdrop = screen.getByTestId('animated-sheet-backdrop');
    fireEvent.press(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // Modal onRequestClose
    const modal = screen.UNSAFE_getByType(require('react-native').Modal);
    modal.props.onRequestClose();
    expect(onClose).not.toHaveBeenCalled();
  });
});
