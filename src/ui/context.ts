import type { ReviewOutcome } from '@/state/actions';
import type { Store } from '@/state/store';
import type { Route } from './router';

/** What every screen is handed when it mounts. */
export interface AppContext {
  store: Store;
  navigate(route: Route): void;
  /** Hands a finished review to the chest sequence. */
  presentReward(outcome: ReviewOutcome): void;
  toast(message: string): void;
}

/**
 * A screen instance.
 *
 * `mounted` runs once `el` is actually in the document — focus calls made
 * before that point are silently dropped, so anything that moves focus has to
 * happen here rather than during construction. `destroy` runs on navigation
 * away.
 */
export interface Screen {
  el: HTMLElement;
  mounted?(): void;
  destroy?(): void;
}

export type ScreenFactory = (ctx: AppContext) => Screen;
