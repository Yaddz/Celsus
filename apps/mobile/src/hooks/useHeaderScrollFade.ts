import { useMemo, useRef } from 'react';
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Liga o fade do XpMinimalHeader à rolagem do conteúdo.
 *
 * O ScrollView limita (throttle) os eventos de `onScroll` e pode descartar o último, deixando o fade
 * preso no valor anterior quando a lista volta ao topo. Por isso o offset também é sincronizado ao
 * fim do arraste e da inércia, e o throttle é 1 (praticamente sem descarte).
 */
export function useHeaderScrollFade() {
  const scrollY = useRef(new Animated.Value(0)).current;

  const scrollProps = useMemo(() => {
    const sync = (e: NativeSyntheticEvent<NativeScrollEvent>) => scrollY.setValue(e.nativeEvent.contentOffset.y);
    return {
      scrollEventThrottle: 1,
      onScroll: sync,
      onScrollEndDrag: sync,
      onMomentumScrollEnd: sync,
    };
  }, [scrollY]);

  return { scrollY, scrollProps };
}
