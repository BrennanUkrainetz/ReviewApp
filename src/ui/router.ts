/**
 * Hash routing. Hash rather than history API so the built app works opened
 * straight off the filesystem, with no server rewrites.
 */
import type { ReviewId } from '@/state/types';

export type Route =
  | { name: 'city' }
  | { name: 'review'; reviewId: ReviewId }
  | { name: 'shop' }
  | { name: 'history' }
  | { name: 'ascension' }
  | { name: 'research' }
  | { name: 'settings' };

export const CITY_ROUTE: Route = { name: 'city' };

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'city':
      return '#/';
    case 'review':
      return `#/review/${route.reviewId}`;
    default:
      return `#/${route.name}`;
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, tail] = path;

  switch (head) {
    case undefined:
      return CITY_ROUTE;
    case 'review':
      return tail === 'morning' || tail === 'daily'
        ? { name: 'review', reviewId: tail }
        : CITY_ROUTE;
    case 'shop':
      return { name: 'shop' };
    case 'history':
      return { name: 'history' };
    case 'ascension':
      return { name: 'ascension' };
    case 'research':
      return { name: 'research' };
    case 'settings':
      return { name: 'settings' };
    default:
      return CITY_ROUTE;
  }
}

export interface Router {
  current(): Route;
  navigate(route: Route): void;
  /** Begins listening and fires `onChange` once with the current route. */
  start(): () => void;
}

export function createRouter(onChange: (route: Route) => void): Router {
  const read = (): Route => parseHash(window.location.hash);

  return {
    current: read,
    navigate(route) {
      const hash = routeToHash(route);
      if (window.location.hash === hash) {
        onChange(route);
        return;
      }
      window.location.hash = hash;
    },
    start() {
      const handler = (): void => onChange(read());
      window.addEventListener('hashchange', handler);
      handler();
      return () => window.removeEventListener('hashchange', handler);
    },
  };
}
