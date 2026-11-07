import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Lê a configuração de "reduzir movimento" do sistema (Android: remover animações;
 * iOS: Reduzir Movimento) e acompanha mudanças em tempo real.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (mounted) setReduced(Boolean(value));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduced(Boolean(value));
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
