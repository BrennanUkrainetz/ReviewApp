/**
 * App shell: owns the store, the router, and which screen is mounted.
 * Screens themselves know nothing about routing beyond `ctx.navigate`.
 */
import { createStoreFromStorage } from '@/state/store';
import type { ReviewOutcome } from '@/state/actions';
import { createToastRail } from './ui/components/toast';
import { createTopbar } from './ui/components/topbar';
import type { AppContext, Screen } from './ui/context';
import { el, replaceChildren } from './ui/dom';
import { syncMotionAttribute } from './ui/motion';
import { createRouter, type Route } from './ui/router';
import { createCityScreen } from './ui/screens/city';
import { createPlaceholderScreen } from './ui/screens/placeholder';
import { createReviewScreen } from './ui/screens/review';

export function mountApp(root: HTMLElement): () => void {
  const store = createStoreFromStorage();
  const stopMotionSync = syncMotionAttribute(store);

  const stage = el('main', { class: 'stage', attrs: { id: 'main' } });
  const topbar = createTopbar(store);
  const toasts = createToastRail();

  replaceChildren(
    root,
    el('div', { class: 'app__sky', attrs: { 'aria-hidden': 'true' } }),
    topbar.el,
    stage,
    toasts.el,
  );

  let current: Screen | null = null;

  const ctx: AppContext = {
    store,
    navigate: (route) => router.navigate(route),
    presentReward: (outcome) => presentReward(outcome),
    toast: (message) => toasts.show(message),
  };

  function screenFor(route: Route): Screen {
    switch (route.name) {
      case 'review':
        return createReviewScreen(ctx, route.reviewId);
      case 'shop':
        return createPlaceholderScreen(ctx, 'Shop', 'Buildings and cosmetics arrive in phase 4.');
      case 'history':
        return createPlaceholderScreen(ctx, 'Progress', 'The history log arrives in phase 5.');
      case 'settings':
        return createPlaceholderScreen(ctx, 'Settings', 'Settings arrive in phase 5.');
      case 'city':
      default:
        return createCityScreen(ctx);
    }
  }

  function mount(route: Route): void {
    current?.destroy?.();
    current = screenFor(route);
    replaceChildren(stage, current.el);
    stage.scrollTop = 0;
  }

  function presentReward(outcome: ReviewOutcome): void {
    router.navigate({ name: 'city' });
    toasts.show(`+${outcome.reward.totalLumen} Lumen`);
  }

  const router = createRouter(mount);
  const stopRouter = router.start();

  return () => {
    stopRouter();
    stopMotionSync();
    current?.destroy?.();
    topbar.destroy();
  };
}
