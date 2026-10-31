/**
 * Setup polyfills and environment adjustments before React Native core initializes.
 * In modern engines (Hermes, browser webviews, Node 19+), certain global properties
 * like `performance` or `navigator` are defined as getter-only or read-only (writable: false).
 * When React Native's `setUpPerformance.js` assigns `global.performance = new Performance()`,
 * it throws `TypeError: property is not writable`.
 *
 * Making these properties writable prevents the runtime startup crash.
 */
if (typeof globalThis !== 'undefined') {
  const readOnlyGlobals = ['performance', 'navigator', 'crypto'] as const;
  for (const prop of readOnlyGlobals) {
    try {
      const desc = Object.getOwnPropertyDescriptor(globalThis, prop);
      if (desc && (desc.writable === false || desc.set === undefined)) {
        const val = (globalThis as any)[prop];
        Object.defineProperty(globalThis, prop, {
          configurable: true,
          writable: true,
          value: val,
        });
      }
    } catch {
      // Safe no-op if property is non-configurable
    }
  }
}

export {};
