/**
 * One place to ask "should this move?". Both the OS preference and the in-app
 * toggle are honoured; timings collapse to zero rather than branching UI code.
 */
import type { Store } from '@/state/store';

export function systemPrefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function prefersReducedMotion(store: Store): boolean {
  return store.getState().settings.reduceMotion || systemPrefersReducedMotion();
}

/** A duration that becomes 0 when motion is reduced. */
export function motionDuration(store: Store, ms: number): number {
  return prefersReducedMotion(store) ? 0 : ms;
}

/** Reflects the in-app toggle onto <html> so CSS can respond globally. */
export function syncMotionAttribute(store: Store): () => void {
  const apply = (): void => {
    document.documentElement.dataset['reduceMotion'] = String(
      store.getState().settings.reduceMotion,
    );
  };
  apply();
  return store.subscribe(apply);
}

/** `setTimeout` as a promise, collapsed to a microtask when motion is off. */
export function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
