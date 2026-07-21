/**
 * A quiet caption over the scene naming the current light and how far it is
 * from golden hour.
 *
 * The lighting itself is the signal; this exists so the metaphor is legible on
 * day one — and so the state is available to screen readers, which can't see a
 * sky warming up.
 */
import { MULTIPLIER_CAP_STREAK } from '@/config/tuning';
import type { Store } from '@/state/store';
import { streakProgress } from '../scene/palette';
import { el, plural } from '../dom';

interface LightStage {
  upTo: number;
  name: string;
}

const STAGES: LightStage[] = [
  { upTo: 0.001, name: 'Night' },
  { upTo: 0.2, name: 'Pre-dawn' },
  { upTo: 0.45, name: 'First light' },
  { upTo: 0.7, name: 'Sunrise' },
  { upTo: 0.95, name: 'Morning gold' },
  { upTo: Infinity, name: 'Golden hour' },
];

export function lightStageName(progress: number): string {
  return STAGES.find((stage) => progress <= stage.upTo)?.name ?? 'Golden hour';
}

export interface LightingCaption {
  el: HTMLElement;
  destroy(): void;
}

export function createLightingCaption(store: Store): LightingCaption {
  const stageName = el('span', { class: 'lighting__stage' });
  const detail = el('span', { class: 'lighting__detail' });
  const fill = el('span', { class: 'lighting__meter-fill' });

  const root = el(
    'figcaption',
    { class: 'lighting' },
    el('span', { class: 'lighting__label' }, stageName, detail),
    el(
      'span',
      {
        class: 'lighting__meter',
        attrs: { role: 'presentation' },
      },
      fill,
    ),
  );

  const render = (): void => {
    const streak = store.getState().streak.current;
    const progress = streakProgress(streak);
    const remaining = Math.max(0, MULTIPLIER_CAP_STREAK - streak);

    stageName.textContent = lightStageName(progress);
    detail.textContent =
      remaining === 0
        ? ' · the city is fully lit'
        : ` · ${plural(remaining, 'day')} to golden hour`;
    fill.style.setProperty('width', `${(progress * 100).toFixed(1)}%`);
  };

  render();
  return { el: root, destroy: store.subscribe(render) };
}
