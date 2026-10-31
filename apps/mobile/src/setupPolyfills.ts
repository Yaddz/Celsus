/**
 * Setup polyfills and environment adjustments before React Native core initializes.
 * In modern engines (Hermes, browser webviews, Node 19+), certain global properties
 * like `performance`, `navigator`, or `crypto` are defined as getter-only or read-only (writable: false).
 * When React Native's `setUpPerformance.js` assigns `global.performance = new Performance()`,
 * it throws `TypeError: property is not writable`.
 *
 * Making these properties writable across all global scopes and prototype chains prevents
 * the runtime startup crash.
 */

function ensureGlobalWritable(target: any, prop: string) {
  if (!target) return;
  try {
    let current = target;
    let desc: PropertyDescriptor | undefined;
    while (current && !desc) {
      desc = Object.getOwnPropertyDescriptor(current, prop);
      current = Object.getPrototypeOf(current);
    }

    if (!desc) return;

    if (desc.writable === true && desc.set === undefined && desc.get === undefined) {
      return;
    }

    let val: any;
    try {
      val = target[prop];
    } catch {
      val = undefined;
    }

    Object.defineProperty(target, prop, {
      value: val,
      writable: true,
      configurable: true,
      enumerable: desc.enumerable !== false,
    });
  } catch {
    try {
      let storedVal: any = target[prop];
      Object.defineProperty(target, prop, {
        get() {
          return storedVal;
        },
        set(nextVal: any) {
          storedVal = nextVal;
        },
        configurable: true,
        enumerable: true,
      });
    } catch {
      // Safe no-op if property is completely sealed
    }
  }
}

const targets: any[] = [];
if (typeof globalThis !== 'undefined') targets.push(globalThis);
if (typeof global !== 'undefined' && (global as any) !== (globalThis as any)) targets.push(global);
if (typeof window !== 'undefined' && (window as any) !== (globalThis as any)) targets.push(window);

const readOnlyGlobals = ['performance', 'navigator', 'crypto', 'window', 'document', 'self'] as const;

for (const target of targets) {
  for (const prop of readOnlyGlobals) {
    ensureGlobalWritable(target, prop);
  }
}

export {};
