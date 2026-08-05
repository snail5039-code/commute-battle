import type { RouteBadge } from './routeIntelligence';

export type RoutePreference = RouteBadge;
export type CommuteDirection = 'commute' | 'return';

export interface FavoriteRoute {
  signature: string;
  totalTime: number;
  totalWalk: number;
  transferCount: number;
  savedAt: number;
}

const STORAGE_KEY = 'commuteRoutePreference';
const DEFAULT_PREFERENCE: RoutePreference = 'fastest';
const FAVORITES_KEY = 'commuteRouteFavorites:v1';

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

function readFavorites(): Record<CommuteDirection, FavoriteRoute[]> {
  const empty = { commute: [], return: [] };
  if (typeof window === 'undefined') return empty;
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || 'null') as Partial<Record<CommuteDirection, FavoriteRoute[]>> | null;
    return {
      commute: Array.isArray(value?.commute) ? value.commute : [],
      return: Array.isArray(value?.return) ? value.return : [],
    };
  } catch {
    return empty;
  }
}

export function getFavoriteRoutes(direction: CommuteDirection): FavoriteRoute[] {
  return readFavorites()[direction];
}

export function toggleFavoriteRoute(direction: CommuteDirection, route: Omit<FavoriteRoute, 'savedAt'>): FavoriteRoute[] {
  const all = readFavorites();
  const exists = all[direction].some((item) => item.signature === route.signature);
  all[direction] = exists
    ? all[direction].filter((item) => item.signature !== route.signature)
    : [{ ...route, savedAt: Date.now() }, ...all[direction]].slice(0, 30);
  if (typeof window !== 'undefined') localStorage.setItem(FAVORITES_KEY, JSON.stringify(all));
  return all[direction];
}
