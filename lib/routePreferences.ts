import type { RouteBadge } from './routeIntelligence';

export type RoutePreference = RouteBadge;

const STORAGE_KEY = 'commuteRoutePreference';
const DEFAULT_PREFERENCE: RoutePreference = 'fastest';

export function getRoutePreference(): RoutePreference {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCE;
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'least-walking' || value === 'fewest-transfers' || value === 'fastest'
    ? value
    : DEFAULT_PREFERENCE;
}

export function saveRoutePreference(preference: RoutePreference): void {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, preference);
}

