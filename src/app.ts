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
import { createAscensionScreen } from './ui/screens/ascension';
import { createResearchScreen } from './ui/screens/research';
import { createCityScreen } from './ui/screens/city';
import { createHistoryScreen } from './ui/screens/history';
import { createReviewScreen } from './ui/screens/review';
import { createRewardOverlay, type RewardOverlay } from './ui/screens/reward';
import { createSettingsScreen } from './ui/screens/settings';
import { createShopScreen } from './ui/screens/shop';

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
  let reward: RewardOverlay | null = null;

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
        return createShopScreen(ctx);
      case 'history':
        return createHistoryScreen(ctx);
      case 'ascension':
        return createAscensionScreen(ctx);
      case 'research':
        return createResearchScreen(ctx);
      case 'settings':
        return createSettingsScreen(ctx);
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
    current.mounted?.();
  }

  /**
   * Shows the chest over the City. Navigating first means the scene behind the
   * overlay is already re-lit by the streak the review just earned.
   */
  function presentReward(outcome: ReviewOutcome): void {
    router.navigate({ name: 'city' });
    reward?.destroy();
    reward?.el.remove();

    const overlay = createRewardOverlay({
      store,
      outcome,
      onClose: () => {
        overlay.destroy();
        overlay.el.remove();
        if (reward === overlay) reward = null;
      },
    });
    reward = overlay;
    root.appendChild(overlay.el);
  }

  const router = createRouter(mount);
  const stopRouter = router.start();

  return () => {
    stopRouter();
    stopMotionSync();
    current?.destroy?.();
    reward?.destroy();
    topbar.destroy();
  };
}
